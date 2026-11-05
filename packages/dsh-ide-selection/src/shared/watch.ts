// ABOUTME: Pool persistent IDE WebSockets across session and workspace subscribers.
// ABOUTME: Adapt pi-x-ide message dispatch with validated snapshots and bounded cleanup.
import { isAbsolute, relative, sep } from "node:path";
import WebSocket from "ws";
import { validateSnapshot } from "./client.js";
import { parseDiagnosticContext } from "./diagnostics.js";
import { ideLockId } from "./ide.js";
import { discoverLocks } from "./lock.js";
import {
  AUTH_HEADER,
  PROTOCOL_VERSION,
  type DiagnosticContext,
  type EditorSelectionSnapshot,
  type IdeLockFile,
} from "./protocol.js";

const MAX_FRAME_BYTES = 1024 * 1024;
const DEFAULT_RETRY_MS = 500;
const INITIALIZE_TIMEOUT_MS = 5_000;
const CLOSE_TIMEOUT_MS = 1_000;
const INITIALIZE_REQUEST_ID = 1;
const CLIENT_NAME = "dsh-ide-selection";
const CLIENT_VERSION = "0.1.0";

export type FollowUpdate =
  | { type: "disconnected" }
  | { type: "cleared" }
  | { type: "selection"; snapshot: EditorSelectionSnapshot };

export interface FollowSelectionOptions {
  cwd: string;
  lockDir: string;
  maxAgeMs: number;
  signal: AbortSignal;
  retryMs?: number;
  ideId?: string;
  pool?: IdeConnectionPool;
  onConnection?: (ideId: string | undefined) => void;
  onUpdate: (update: FollowUpdate) => void;
  /** Used only by a standalone follower's private pool. */
  onDiagnostic?: (context: DiagnosticContext) => void;
}

/** Keep the best matching IDE connection current until `signal` aborts. */
export function followSelection(options: FollowSelectionOptions): void {
  const pool =
    options.pool ??
    new IdeConnectionPool(options.signal, (_ideId, context) => options.onDiagnostic?.(context));
  void follow(options, pool);
}

async function follow(options: FollowSelectionOptions, pool: IdeConnectionPool): Promise<void> {
  let connected = false;
  const disconnect = () => {
    if (!connected) return;
    connected = false;
    options.onConnection?.(undefined);
  };
  options.onUpdate({ type: "disconnected" });
  options.onConnection?.(undefined);
  try {
    while (!options.signal.aborted) {
      const locks = await discoverLocks(
        options.lockDir,
        options.cwd,
        options.maxAgeMs,
        options.signal,
      ).catch(() => []);
      const lock =
        options.ideId === undefined
          ? locks[0]
          : locks.find((candidate) => ideLockId(candidate) === options.ideId);
      if (options.signal.aborted) return;
      if (lock) {
        connected = true;
        options.onConnection?.(ideLockId(lock));
        await pool.watch(lock, options.cwd, options.signal, (update) => {
          if (update.type === "disconnected") disconnect();
          options.onUpdate(update);
        });
        disconnect();
      }
      if (options.signal.aborted) return;
      await delay(options.retryMs ?? DEFAULT_RETRY_MS, options.signal);
    }
  } finally {
    disconnect();
  }
}

/** One authenticated transport per IDE identity, not per session or cwd. */
export class IdeConnectionPool {
  private readonly connections = new Map<string, PooledConnection>();

  constructor(
    private readonly signal: AbortSignal,
    private readonly onDiagnostic?: (ideId: string, context: DiagnosticContext) => void,
    private readonly onAttach?: (ideId: string, snapshot: EditorSelectionSnapshot) => void,
  ) {
    signal.addEventListener(
      "abort",
      () => {
        for (const connection of this.connections.values()) connection.finish();
      },
      { once: true },
    );
  }

  /** Resolve when this subscriber aborts, the pool stops, or the socket closes. */
  watch(
    lock: IdeLockFile,
    cwd: string,
    signal: AbortSignal,
    onUpdate: (update: FollowUpdate) => void,
  ): Promise<void> {
    if (signal.aborted || this.signal.aborted) return Promise.resolve();
    const id = ideLockId(lock);
    let connection = this.connections.get(id);
    if (!connection) {
      try {
        connection = new PooledConnection(
          lock,
          cwd,
          () => this.connections.delete(id),
          (context) => this.onDiagnostic?.(id, context),
          (snapshot) => this.onAttach?.(id, snapshot),
        );
      } catch {
        onUpdate({ type: "disconnected" });
        return Promise.resolve();
      }
      this.connections.set(id, connection);
    }
    return connection.watch(signal, onUpdate);
  }
}

interface Subscriber {
  onUpdate: (update: FollowUpdate) => void;
  finish: () => void;
}

class PooledConnection {
  private readonly socket: WebSocket;
  private readonly timer: ReturnType<typeof setTimeout>;
  private readonly subscribers = new Set<Subscriber>();
  private latest: FollowUpdate | undefined;
  private initialized = false;
  private finished = false;

  constructor(
    private readonly lock: IdeLockFile,
    cwd: string,
    private readonly onFinish: () => void,
    private readonly onDiagnostic: (context: DiagnosticContext) => void,
    private readonly onAttach: (snapshot: EditorSelectionSnapshot) => void,
  ) {
    this.socket = new WebSocket(`ws://${lock.host}:${lock.port}`, {
      handshakeTimeout: INITIALIZE_TIMEOUT_MS,
      headers: { [AUTH_HEADER]: lock.authToken },
      maxPayload: MAX_FRAME_BYTES,
    });
    // Bound both the HTTP upgrade and a peer that never answers initialize.
    this.timer = setTimeout(() => this.finish(), INITIALIZE_TIMEOUT_MS);
    this.socket.once("error", () => this.finish());
    this.socket.once("close", () => this.finish());
    this.socket.once("open", () => {
      this.socket.send(
        JSON.stringify({
          jsonrpc: "2.0",
          id: INITIALIZE_REQUEST_ID,
          method: "initialize",
          params: {
            protocolVersion: PROTOCOL_VERSION,
            client: { name: CLIENT_NAME, version: CLIENT_VERSION },
            cwd,
          },
        }),
        (error) => {
          if (error) this.finish();
        },
      );
    });
    this.socket.on("message", (raw) => this.receive(raw.toString()));
  }

  watch(signal: AbortSignal, onUpdate: (update: FollowUpdate) => void): Promise<void> {
    return new Promise((resolve) => {
      const subscriber: Subscriber = {
        onUpdate,
        finish: () => {
          signal.removeEventListener("abort", subscriber.finish);
          this.subscribers.delete(subscriber);
          onUpdate({ type: "disconnected" });
          resolve();
          if (this.subscribers.size === 0) this.finish();
        },
      };
      this.subscribers.add(subscriber);
      signal.addEventListener("abort", subscriber.finish, { once: true });
      if (this.latest) onUpdate(this.latest);
    });
  }

  finish(): void {
    if (this.finished) return;
    this.finished = true;
    clearTimeout(this.timer);
    this.latest = undefined;
    this.onFinish();
    this.socket.removeAllListeners();
    // ws emits a late error when an in-progress HTTP upgrade is canceled.
    const ignoreError = () => undefined;
    this.socket.on("error", ignoreError);
    const closeTimer = setTimeout(() => this.socket.terminate(), CLOSE_TIMEOUT_MS);
    closeTimer.unref();
    this.socket.once("close", () => {
      clearTimeout(closeTimer);
      this.socket.removeListener("error", ignoreError);
    });
    if (this.socket.readyState === WebSocket.OPEN) this.socket.close();
    else if (this.socket.readyState !== WebSocket.CLOSED) this.socket.terminate();
    else {
      clearTimeout(closeTimer);
      this.socket.removeAllListeners();
    }
    for (const subscriber of this.subscribers) subscriber.finish();
  }

  private receive(text: string): void {
    if (this.finished) return;
    let value: unknown;
    try {
      value = JSON.parse(text);
    } catch {
      return;
    }
    if (!isRecord(value) || value.jsonrpc !== "2.0") return;
    if (value.id === INITIALIZE_REQUEST_ID) {
      const result = value.result;
      if (
        value.error !== undefined ||
        !isRecord(result) ||
        result.protocolVersion !== PROTOCOL_VERSION ||
        !isRecord(result.server) ||
        result.server.ide !== "vscode"
      ) {
        this.finish();
      } else {
        this.initialized = true;
        clearTimeout(this.timer);
      }
      return;
    }
    if (!this.initialized || value.id !== undefined) return;
    if (value.method === "at_mentioned") {
      const snapshot = validateSnapshot(value.params, this.lock);
      if (snapshot) this.onAttach(snapshot);
      return;
    }
    if (value.method === "diagnostic_fix_requested") {
      const context = parseDiagnosticNotification(value.params, this.lock);
      if (context) this.onDiagnostic(context);
      return;
    }
    let update: FollowUpdate | undefined;
    if (value.method === "selection_changed") {
      const snapshot = validateSnapshot(value.params, this.lock);
      if (snapshot) update = { type: "selection", snapshot };
    } else if (
      value.method === "selection_cleared" &&
      isRecord(value.params) &&
      value.params.source === "vscode" &&
      value.params.reason === "no-active-editor"
    ) {
      update = { type: "cleared" };
    }
    if (!update) return;
    this.latest = update;
    // A callback may subscribe a picker probe and consume the replay immediately.
    // Do not deliver this same wire notification a second time to that new probe.
    const subscribers = [...this.subscribers];
    for (const subscriber of subscribers) {
      if (this.subscribers.has(subscriber)) subscriber.onUpdate(update);
    }
  }
}

function inside(base: string, target: string): boolean {
  const rel = relative(base, target);
  return rel === "" || (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

function parseDiagnosticNotification(
  value: unknown,
  lock: IdeLockFile,
): DiagnosticContext | undefined {
  const context = parseDiagnosticContext(value);
  if (
    !context ||
    !isAbsolute(context.filePath) ||
    !lock.workspaceFolders.some((folder) => inside(folder, context.filePath)) ||
    (context.workspaceFolder !== undefined &&
      (!lock.workspaceFolders.includes(context.workspaceFolder) ||
        !inside(context.workspaceFolder, context.filePath)))
  )
    return undefined;
  return context;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function delay(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(finish, ms);
    signal.addEventListener("abort", finish, { once: true });
    function finish(): void {
      clearTimeout(timer);
      signal.removeEventListener("abort", finish);
      resolve();
    }
  });
}
