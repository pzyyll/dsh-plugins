// ABOUTME: Reads one VS Code selection snapshot from the best matching local IDE lock.
// ABOUTME: Adapted from pi-x-ide connection/discovery for abortable one-shot polling.

import { isAbsolute, relative, sep } from "node:path";
import { performance } from "node:perf_hooks";
import WebSocket from "ws";
import { discoverLocks, workspaceMatchDistance } from "./lock.js";
import { ideLockId, type AvailableIde } from "./ide.js";
import {
  AUTH_HEADER,
  PROTOCOL_VERSION,
  type EditorSelectionSnapshot,
  type IdeLockFile,
  type Position,
} from "./protocol.js";

const MAX_FRAME_BYTES = 1024 * 1024;
const MIN_TIMEOUT_MS = 1;
const MAX_TIMER_DELAY_MS = 2_147_483_647;
const INITIALIZE_REQUEST_ID = 1;
const CLIENT_NAME = "dsh-ide-selection";
const CLIENT_VERSION = "0.0.0";

type CandidateReadResult =
  | { kind: "selection"; snapshot: EditorSelectionSnapshot }
  | { kind: "cleared" }
  | { kind: "failed" };

export interface ReadSelectionOptions {
  cwd: string;
  lockDir: string;
  timeoutMs: number;
  maxAgeMs: number;
  signal: AbortSignal;
  ideId?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPosition(value: unknown): value is Position {
  return (
    isRecord(value) &&
    typeof value.line === "number" &&
    Number.isSafeInteger(value.line) &&
    value.line >= 0 &&
    typeof value.character === "number" &&
    Number.isSafeInteger(value.character) &&
    value.character >= 0
  );
}

function comparePosition(a: Position, b: Position): number {
  return a.line - b.line || a.character - b.character;
}

function inside(base: string, target: string): boolean {
  const rel = relative(base, target);
  return rel === "" || (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

function validateSnapshot(value: unknown, lock: IdeLockFile): EditorSelectionSnapshot | undefined {
  if (
    !isRecord(value) ||
    value.source !== "vscode" ||
    typeof value.filePath !== "string" ||
    !isAbsolute(value.filePath) ||
    value.filePath.includes("\0") ||
    !Array.isArray(value.ranges)
  )
    return undefined;
  const filePath = value.filePath;
  if (value.workspaceFolder !== undefined) {
    if (
      typeof value.workspaceFolder !== "string" ||
      !isAbsolute(value.workspaceFolder) ||
      !lock.workspaceFolders.some((folder) => folder === value.workspaceFolder) ||
      !inside(value.workspaceFolder, filePath)
    )
      return undefined;
  } else if (
    lock.workspaceFolders.length > 0 &&
    !lock.workspaceFolders.some((folder) => inside(folder, filePath))
  ) {
    return undefined;
  }
  const ranges: EditorSelectionSnapshot["ranges"] = [];
  for (const candidate of value.ranges) {
    if (
      !isRecord(candidate) ||
      typeof candidate.text !== "string" ||
      !isRecord(candidate.selection)
    )
      return undefined;
    const start = candidate.selection.start;
    const end = candidate.selection.end;
    if (!isPosition(start) || !isPosition(end) || comparePosition(start, end) > 0) return undefined;
    ranges.push({ text: candidate.text, selection: { start, end } });
  }
  if (
    value.receivedAt !== undefined &&
    (typeof value.receivedAt !== "number" || !Number.isFinite(value.receivedAt))
  )
    return undefined;
  return {
    source: "vscode",
    filePath,
    ...(typeof value.workspaceFolder === "string"
      ? { workspaceFolder: value.workspaceFolder }
      : {}),
    ranges,
    ...(typeof value.receivedAt === "number" ? { receivedAt: value.receivedAt } : {}),
  };
}

function readCandidate(
  lock: IdeLockFile,
  cwd: string,
  timeoutMs: number,
  signal: AbortSignal,
): Promise<CandidateReadResult> {
  if (signal.aborted) return Promise.resolve({ kind: "failed" });
  return new Promise((resolve) => {
    let socket: WebSocket;
    try {
      socket = new WebSocket(`ws://${lock.host}:${lock.port}`, {
        handshakeTimeout: Math.max(MIN_TIMEOUT_MS, timeoutMs),
        headers: { [AUTH_HEADER]: lock.authToken },
        maxPayload: MAX_FRAME_BYTES,
      });
    } catch {
      resolve({ kind: "failed" });
      return;
    }

    let settled = false;
    let initialized = false;
    const timer = setTimeout(() => finish({ kind: "failed" }), Math.max(MIN_TIMEOUT_MS, timeoutMs));
    const onAbort = () => finish({ kind: "failed" });
    const ignoreLateSocketError = () => undefined;
    const finish = (result: CandidateReadResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      socket.removeAllListeners();
      if (
        socket.readyState === WebSocket.CONNECTING ||
        socket.readyState === WebSocket.OPEN ||
        socket.readyState === WebSocket.CLOSING
      ) {
        socket.on("error", ignoreLateSocketError);
        socket.once("close", () => socket.removeListener("error", ignoreLateSocketError));
        try {
          socket.terminate();
        } catch {
          // Keep the no-op error handler until close even if teardown itself fails.
        }
      }
      resolve(result);
    };
    signal.addEventListener("abort", onAbort, { once: true });
    socket.once("open", () => {
      if (signal.aborted) return finish({ kind: "failed" });
      socket.send(
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
          if (error) finish({ kind: "failed" });
        },
      );
    });
    socket.on("message", (raw) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (!isRecord(parsed) || parsed.jsonrpc !== "2.0") return;
      if (parsed.id === INITIALIZE_REQUEST_ID) {
        const result = parsed.result;
        if (
          isRecord(result) &&
          result.protocolVersion === PROTOCOL_VERSION &&
          isRecord(result.server) &&
          result.server.ide === "vscode"
        )
          initialized = true;
        else finish({ kind: "failed" });
        return;
      }
      if (!initialized || typeof parsed.method !== "string") return;
      if (parsed.method === "selection_cleared") {
        const validClear =
          isRecord(parsed.params) &&
          parsed.params.source === "vscode" &&
          parsed.params.reason === "no-active-editor";
        finish({ kind: validClear ? "cleared" : "failed" });
        return;
      }
      if (parsed.method !== "selection_changed") return;
      const snapshot = validateSnapshot(parsed.params, lock);
      finish(snapshot ? { kind: "selection", snapshot } : { kind: "failed" });
    });
    socket.once("error", () => finish({ kind: "failed" }));
    socket.once("close", () => finish({ kind: "failed" }));
  });
}

/** Read a fresh snapshot; an explicit target never falls back to another IDE. */
export async function readSelection(
  options: ReadSelectionOptions,
): Promise<EditorSelectionSnapshot | undefined> {
  return withDeadline<EditorSelectionSnapshot | undefined>(
    options,
    () => undefined,
    async (signal, deadline) => {
      const locks = await discoverLocks(options.lockDir, options.cwd, options.maxAgeMs, signal);
      for (const lock of locks) {
        if (options.ideId !== undefined && ideLockId(lock) !== options.ideId) continue;
        if (signal.aborted) return undefined;
        const remainingMs = deadline - performance.now();
        if (remainingMs <= 0) return undefined;
        const result = await readCandidate(lock, options.cwd, remainingMs, signal);
        if (result.kind === "selection") return result.snapshot;
        if (result.kind === "cleared" || signal.aborted) return undefined;
      }
      return undefined;
    },
  );
}

/** Authenticated IDEs plus the one automatic selection would read for this workspace. */
export interface IdeTargetList {
  readonly ides: readonly AvailableIde[];
  /** Present when a reachable IDE folder is equal to or inside the Session workspace. */
  readonly automaticId?: string;
}

/** List authenticated, responsive IDEs together with the workspace-matched target. */
export async function listIdeTargets(options: ReadSelectionOptions): Promise<IdeTargetList> {
  const rows: Array<AvailableIde | undefined> = [];
  let locks: IdeLockFile[] = [];
  const collected = (): IdeTargetList => {
    const ides = rows.filter((ide): ide is AvailableIde => ide !== undefined);
    const automatic = ides.find((ide) => ide.workspaceMatched);
    return { ides, ...(automatic === undefined ? {} : { automaticId: automatic.id }) };
  };
  return withDeadline<IdeTargetList>(options, collected, async (signal, deadline) => {
    locks = await discoverLocks(options.lockDir, options.cwd, options.maxAgeMs, signal, "all");
    await Promise.all(
      locks.map(async (lock, index) => {
        const remainingMs = deadline - performance.now();
        if (signal.aborted || remainingMs <= 0) return;
        const response = await readCandidate(lock, options.cwd, remainingMs, signal);
        if (response.kind === "failed" || signal.aborted) return;
        rows[index] = {
          id: ideLockId(lock),
          name: lock.name,
          host: lock.host,
          port: lock.port,
          workspaceFolders: [...lock.workspaceFolders],
          workspaceMatched: Number.isFinite(workspaceMatchDistance(lock, options.cwd)),
        };
      }),
    );
    return collected();
  });
}

/** List authenticated, responsive IDEs, including IDEs in other workspaces. */
export async function listAvailableIde(options: ReadSelectionOptions): Promise<AvailableIde[]> {
  return [...(await listIdeTargets(options)).ides];
}

async function withDeadline<T>(
  options: ReadSelectionOptions,
  fallback: () => T,
  operation: (signal: AbortSignal, deadline: number) => Promise<T>,
): Promise<T> {
  if (
    options.signal.aborted ||
    !Number.isSafeInteger(options.timeoutMs) ||
    options.timeoutMs <= 0 ||
    options.timeoutMs > MAX_TIMER_DELAY_MS
  )
    return fallback();
  const deadline = performance.now() + options.timeoutMs;
  const lifetime = new AbortController();
  const timer = setTimeout(() => lifetime.abort(), options.timeoutMs);
  const signal = AbortSignal.any([options.signal, lifetime.signal]);
  let onAbort: (() => void) | undefined;
  try {
    const canceled = new Promise<T>((resolve) => {
      onAbort = () => resolve(fallback());
      signal.addEventListener("abort", onAbort, { once: true });
    });
    if (signal.aborted) return fallback();
    return await Promise.race([operation(signal, deadline), canceled]);
  } finally {
    clearTimeout(timer);
    if (onAbort) signal.removeEventListener("abort", onAbort);
    lifetime.abort();
  }
}
