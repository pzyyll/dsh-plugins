// ABOUTME: Follow one IDE lock and report selection changes until cancellation.
// ABOUTME: Reconnect after discovery or socket failures without retaining selected text.
import WebSocket from "ws";
import { discoverLocks } from "./lock.js";
import { ideLockId } from "./ide.js";
import {
  AUTH_HEADER,
  PROTOCOL_VERSION,
  type EditorSelectionSnapshot,
  type IdeLockFile,
  type Position,
} from "./protocol.js";

const MAX_FRAME_BYTES = 1024 * 1024;
const DEFAULT_RETRY_MS = 500;
const HANDSHAKE_TIMEOUT_MS = 5_000;
const INITIALIZE_REQUEST_ID = 1;

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
  onUpdate: (update: FollowUpdate) => void;
}

/** Keep the best matching IDE connection current until `signal` aborts. */
export function followSelection(options: FollowSelectionOptions): void {
  const retryMs = options.retryMs ?? DEFAULT_RETRY_MS;
  void follow(options, retryMs);
}

async function follow(options: FollowSelectionOptions, retryMs: number): Promise<void> {
  options.onUpdate({ type: "disconnected" });
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
    if (!lock) {
      options.onUpdate({ type: "disconnected" });
      await delay(retryMs, options.signal);
      continue;
    }
    await watchLock(lock, options.cwd, options.signal, options.onUpdate);
    if (options.signal.aborted) return;
    options.onUpdate({ type: "disconnected" });
    await delay(retryMs, options.signal);
  }
}

function watchLock(
  lock: IdeLockFile,
  cwd: string,
  signal: AbortSignal,
  onUpdate: (update: FollowUpdate) => void,
): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const socket = new WebSocket(`ws://${lock.host}:${lock.port}`, {
      handshakeTimeout: HANDSHAKE_TIMEOUT_MS,
      headers: { [AUTH_HEADER]: lock.authToken },
      maxPayload: MAX_FRAME_BYTES,
    });
    let settled = false;
    let initialized = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", finish);
      socket.removeAllListeners();
      socket.on("error", () => undefined);
      if (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN) {
        socket.terminate();
      }
      resolve();
    };
    signal.addEventListener("abort", finish, { once: true });
    socket.once("error", finish);
    socket.once("close", finish);
    socket.once("open", () => {
      socket.send(
        JSON.stringify({
          jsonrpc: "2.0",
          id: INITIALIZE_REQUEST_ID,
          method: "initialize",
          params: {
            protocolVersion: PROTOCOL_VERSION,
            client: { name: "dsh-ide-selection", version: "0.1.0" },
            cwd,
          },
        }),
      );
    });
    socket.on("message", (raw) => {
      const update = parseUpdate(raw.toString(), initialized);
      if (update === "initialized") initialized = true;
      else if (update) onUpdate(update);
    });
  });
}

function parseUpdate(text: string, initialized: boolean): FollowUpdate | "initialized" | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (!isRecord(parsed) || parsed.jsonrpc !== "2.0") return undefined;
  if (parsed.id === INITIALIZE_REQUEST_ID) {
    const result = parsed.result;
    if (
      isRecord(result) &&
      result.protocolVersion === PROTOCOL_VERSION &&
      isRecord(result.server) &&
      result.server.ide === "vscode"
    )
      return "initialized";
    return undefined;
  }
  if (!initialized || typeof parsed.method !== "string" || !isRecord(parsed.params))
    return undefined;
  if (parsed.method === "selection_cleared") {
    return parsed.params.source === "vscode" && parsed.params.reason === "no-active-editor"
      ? { type: "cleared" }
      : undefined;
  }
  if (parsed.method !== "selection_changed") return undefined;
  const snapshot = parseSnapshot(parsed.params);
  return snapshot ? { type: "selection", snapshot } : undefined;
}

function parseSnapshot(value: Record<string, unknown>): EditorSelectionSnapshot | undefined {
  if (
    value.source !== "vscode" ||
    typeof value.filePath !== "string" ||
    !Array.isArray(value.ranges)
  ) {
    return undefined;
  }
  const ranges = [];
  for (const range of value.ranges) {
    if (
      !isRecord(range) ||
      !isRecord(range.selection) ||
      !isPosition(range.selection.start) ||
      !isPosition(range.selection.end)
    ) {
      return undefined;
    }
    ranges.push({
      text: "",
      selection: { start: range.selection.start, end: range.selection.end },
    });
  }
  return {
    source: "vscode",
    filePath: value.filePath,
    ...(typeof value.workspaceFolder === "string"
      ? { workspaceFolder: value.workspaceFolder }
      : {}),
    ranges,
  };
}

function isPosition(value: unknown): value is Position {
  return (
    isRecord(value) && Number.isSafeInteger(value.line) && Number.isSafeInteger(value.character)
  );
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
