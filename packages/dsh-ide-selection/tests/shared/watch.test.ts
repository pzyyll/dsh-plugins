// ABOUTME: Verify pooled real WebSockets retain full selections and dispatch diagnostics once.
// ABOUTME: Exercise discovery, validation, replay, initialization failures, and cancellation.
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import type { Socket } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import WebSocket, { WebSocketServer } from "ws";
import { createLock, writeLock } from "../../src/shared/lock.js";
import { ideLockId } from "../../src/shared/ide.js";
import {
  AUTH_HEADER,
  PROTOCOL_VERSION,
  type DiagnosticContext,
  type EditorSelectionSnapshot,
} from "../../src/shared/protocol.js";
import { IdeServer } from "../../src/shared/server.js";
import { followSelection, IdeConnectionPool, type FollowUpdate } from "../../src/shared/watch.js";

const roots: string[] = [];
const servers: IdeServer[] = [];
const controllers: AbortController[] = [];
const cleanups: Array<() => Promise<void>> = [];
const TEST_MAX_AGE_MS = 60_000;
const INITIALIZATION_TEST_TIMEOUT_MS = 10_000;
const IDLE_OBSERVATION_MS = 30;
const AUTH_TOKEN = "e".repeat(64);
const WATCH_RETRY_MS = 20;
const MISMATCH_OBSERVATION_MS = 250;
const ABORT_SETTLE_MS = 10;
afterEach(async () => {
  for (const controller of controllers.splice(0)) controller.abort();
  await Promise.all(servers.splice(0).map((server) => server.stop()));
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
  await Promise.all(roots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

const selected: EditorSelectionSnapshot = {
  source: "vscode",
  filePath: "/work/app/src/example.ts",
  workspaceFolder: "/work/app",
  ranges: [
    {
      text: "secret selection",
      selection: { start: { line: 9, character: 0 }, end: { line: 11, character: 2 } },
    },
  ],
};

describe("followSelection", () => {
  it("follows an explicit descendant IDE retaining full text", async () => {
    const dir = await mkdtemp(join(tmpdir(), "dsh-watch-manual-"));
    roots.push(dir);
    const local = new IdeServer("a".repeat(64), () => selected);
    const manualSnapshot = {
      ...selected,
      filePath: "/work/app/other/selected.ts",
      workspaceFolder: "/work/app/other",
    };
    const manual = new IdeServer("b".repeat(64), () => manualSnapshot);
    servers.push(local, manual);
    const localPort = await local.start();
    const manualPort = await manual.start();
    const manualLock = createLock(manualPort, "b".repeat(64), ["/work/app/other"]);
    await writeLock(join(dir, "local.lock"), createLock(localPort, "a".repeat(64), ["/work/app"]));
    await writeLock(join(dir, "manual.lock"), manualLock);
    const updates: FollowUpdate[] = [];
    const controller = new AbortController();
    controllers.push(controller);
    followSelection({
      cwd: "/work/app",
      lockDir: dir,
      maxAgeMs: TEST_MAX_AGE_MS,
      ideId: ideLockId(manualLock),
      signal: controller.signal,
      onUpdate: (update) => updates.push(update),
    });
    await waitFor(() => updates.some((update) => update.type === "selection"));
    expect(updates.find((update) => update.type === "selection")).toMatchObject({
      snapshot: { filePath: manualSnapshot.filePath, ranges: [{ text: "secret selection" }] },
    });
  });

  it("does not connect an explicit mismatching target when another IDE matches", async () => {
    const dir = await mkdtemp(join(tmpdir(), "dsh-watch-mismatch-"));
    roots.push(dir);
    let localReads = 0;
    let remoteReads = 0;
    const local = new IdeServer("c".repeat(64), () => {
      localReads++;
      return selected;
    });
    const remoteSnapshot = {
      ...selected,
      filePath: "/other/selected.ts",
      workspaceFolder: "/other",
    };
    const remote = new IdeServer("d".repeat(64), () => {
      remoteReads++;
      return remoteSnapshot;
    });
    servers.push(local, remote);
    const localPort = await local.start();
    const remotePort = await remote.start();
    const remoteLock = createLock(remotePort, "d".repeat(64), ["/other"]);
    await writeLock(join(dir, "local.lock"), createLock(localPort, "c".repeat(64), ["/work/app"]));
    await writeLock(join(dir, "remote.lock"), remoteLock);
    const controller = new AbortController();
    controllers.push(controller);
    followSelection({
      cwd: "/work/app",
      lockDir: dir,
      maxAgeMs: TEST_MAX_AGE_MS,
      retryMs: WATCH_RETRY_MS,
      ideId: ideLockId(remoteLock),
      signal: controller.signal,
      onUpdate: () => undefined,
    });

    await new Promise((resolve) => setTimeout(resolve, MISMATCH_OBSERVATION_MS));
    controller.abort();
    await new Promise((resolve) => setTimeout(resolve, ABORT_SETTLE_MS));
    expect(remoteReads).toBe(0);
    expect(localReads).toBe(0);
  });

  it("follows the initial editor, later changes, and a disconnect", async () => {
    const dir = await mkdtemp(join(tmpdir(), "dsh-watch-"));
    roots.push(dir);
    let current: EditorSelectionSnapshot | undefined;
    const server = new IdeServer("a".repeat(64), () => current);
    servers.push(server);
    const port = await server.start();
    await writeLock(join(dir, "vscode.lock"), createLock(port, "a".repeat(64), ["/work/app"]));
    const updates: FollowUpdate[] = [];
    const controller = new AbortController();
    controllers.push(controller);
    followSelection({
      cwd: "/work/app",
      lockDir: dir,
      maxAgeMs: TEST_MAX_AGE_MS,
      retryMs: WATCH_RETRY_MS,
      signal: controller.signal,
      onUpdate: (update) => updates.push(update),
    });

    await waitFor(() => updates.some((update) => update.type === "cleared"));
    current = selected;
    server.broadcast(selected);
    await waitFor(() => updates.some((update) => update.type === "selection"));
    const selection = updates.find((update) => update.type === "selection");
    expect(selection).toMatchObject({
      type: "selection",
      snapshot: { filePath: selected.filePath, ranges: [{ text: "secret selection" }] },
    });

    server.broadcast(undefined);
    await waitFor(() => updates.filter((update) => update.type === "cleared").length >= 2);
    await server.stop();
    await waitFor(() => updates.at(-1)?.type === "disconnected");
  });
});

const diagnostic: DiagnosticContext = {
  source: "vscode",
  action: "fix",
  filePath: selected.filePath,
  workspaceFolder: "/work/app",
  documentVersion: 1,
  diagnostics: [
    {
      severity: "error",
      message: "Cannot resolve name",
      range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
      selectedText: "x",
      contextLines: [],
    },
  ],
};

function controller(): AbortController {
  const value = new AbortController();
  controllers.push(value);
  return value;
}

async function peer(initialize = true) {
  const server = new WebSocketServer({ host: "127.0.0.1", port: 0 });
  await once(server, "listening");
  const address = server.address();
  if (typeof address !== "object" || address === null) throw new Error("missing server address");
  const lock = createLock(address.port, AUTH_TOKEN, ["/work/app"]);
  const sockets: WebSocket[] = [];
  const initializations: Array<Record<string, unknown>> = [];
  const auth: Array<string | string[] | undefined> = [];
  server.on("connection", (socket, request) => {
    sockets.push(socket);
    auth.push(request.headers[AUTH_HEADER.toLowerCase()]);
    socket.on("message", (raw) => {
      const request = JSON.parse(raw.toString());
      initializations.push(request);
      if (initialize) {
        socket.send(
          JSON.stringify({
            jsonrpc: "2.0",
            id: request.id,
            result: { protocolVersion: PROTOCOL_VERSION, server: { ide: "vscode" } },
          }),
        );
      }
    });
  });
  cleanups.push(async () => {
    for (const socket of server.clients) socket.terminate();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  return {
    lock,
    sockets,
    initializations,
    auth,
    send(method: string, params: unknown) {
      for (const socket of server.clients)
        socket.send(JSON.stringify({ jsonrpc: "2.0", method, params }));
    },
  };
}

function watch(pool: IdeConnectionPool, lock: ReturnType<typeof createLock>, cwd = "/work/app") {
  const lifetime = controller();
  const updates: FollowUpdate[] = [];
  const done = pool.watch(lock, cwd, lifetime.signal, (update) => updates.push(update));
  return { lifetime, updates, done };
}

async function pause(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, IDLE_OBSERVATION_MS));
}

describe("pooled followSelection", () => {
  it("reports connection identity before updates, retries after disconnect, and clears identity on stop", async () => {
    const remote = await peer();
    const dir = await mkdtemp(join(tmpdir(), "dsh-watch-pool-"));
    roots.push(dir);
    await writeLock(join(dir, "vscode.lock"), remote.lock);
    const pool = new IdeConnectionPool(controller().signal);
    const firstLifetime = controller();
    const secondLifetime = controller();
    const identities: Array<string | undefined> = [];
    let currentId: string | undefined;
    const firstUpdates: FollowUpdate[] = [];
    const secondUpdates: FollowUpdate[] = [];
    followSelection({
      cwd: "/work/app",
      lockDir: dir,
      maxAgeMs: TEST_MAX_AGE_MS,
      retryMs: WATCH_RETRY_MS,
      pool,
      signal: firstLifetime.signal,
      onConnection: (id) => {
        currentId = id;
        identities.push(id);
      },
      onUpdate: (update) => {
        if (update.type === "selection") expect(currentId).toBe(ideLockId(remote.lock));
        firstUpdates.push(update);
      },
    });
    followSelection({
      cwd: "/work",
      lockDir: dir,
      maxAgeMs: TEST_MAX_AGE_MS,
      retryMs: WATCH_RETRY_MS,
      pool,
      signal: secondLifetime.signal,
      onUpdate: (update) => secondUpdates.push(update),
    });
    await waitFor(() => remote.initializations.length === 1);
    remote.send("selection_changed", selected);
    await waitFor(
      () =>
        firstUpdates.some((update) => update.type === "selection") &&
        secondUpdates.some((update) => update.type === "selection"),
    );
    expect(remote.sockets).toHaveLength(1);
    remote.sockets[0]?.close();
    await waitFor(() => identities.filter((id) => id === ideLockId(remote.lock)).length === 2);
    await waitFor(() => remote.initializations.length === 2);
    expect(firstUpdates.filter((update) => update.type === "selection")).toHaveLength(1);
    expect(identities.slice(0, 4)).toEqual([
      undefined,
      ideLockId(remote.lock),
      undefined,
      ideLockId(remote.lock),
    ]);
    firstLifetime.abort();
    await waitFor(() => identities.at(-1) === undefined);
    expect(remote.sockets[1]?.readyState).toBe(WebSocket.OPEN);
    secondLifetime.abort();
    await waitFor(() => remote.sockets[1]?.readyState === WebSocket.CLOSED);
  });
});

describe("IdeConnectionPool", () => {
  it("shares one authenticated socket across cwd watchers, replays full text, and refcounts cleanup", async () => {
    const remote = await peer();
    const lifetime = controller();
    const diagnostics: Array<{ id: string; context: DiagnosticContext }> = [];
    const pool = new IdeConnectionPool(lifetime.signal, (id, context) =>
      diagnostics.push({ id, context }),
    );
    const first = watch(pool, remote.lock, "/work/app/first");
    const second = watch(pool, remote.lock, "/work/app/second");
    await waitFor(() => remote.initializations.length === 1);
    remote.send("selection_changed", selected);
    await waitFor(() => first.updates.length === 1 && second.updates.length === 1);
    expect(first.updates[0]).toEqual({ type: "selection", snapshot: selected });
    expect(second.updates).toEqual(first.updates);
    expect(remote.sockets).toHaveLength(1);
    expect(remote.auth).toEqual([AUTH_TOKEN]);
    expect(remote.initializations[0]).toEqual({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: PROTOCOL_VERSION,
        client: { name: "dsh-ide-selection", version: "0.1.0" },
        cwd: "/work/app/first",
      },
    });
    const replay = watch(pool, remote.lock, "/work/app/third");
    expect(replay.updates).toEqual(first.updates);
    remote.send("diagnostic_fix_requested", diagnostic);
    await waitFor(() => diagnostics.length === 1);
    expect(diagnostics).toEqual([{ id: ideLockId(remote.lock), context: diagnostic }]);
    first.lifetime.abort();
    await first.done;
    expect(remote.sockets[0]?.readyState).toBe(WebSocket.OPEN);
    remote.send("selection_cleared", { source: "vscode", reason: "no-active-editor" });
    await waitFor(() => second.updates.at(-1)?.type === "cleared");
    expect(first.updates.at(-1)?.type).toBe("disconnected");
    const clearedReplay = watch(pool, remote.lock);
    expect(clearedReplay.updates).toEqual([{ type: "cleared" }]);
    second.lifetime.abort();
    replay.lifetime.abort();
    clearedReplay.lifetime.abort();
    await Promise.all([second.done, replay.done, clearedReplay.done]);
    await waitFor(() => remote.sockets[0]?.readyState === WebSocket.CLOSED);
  });

  it("allows picker probes to abort synchronously from initial delivery and cache replay", async () => {
    const remote = await peer();
    const pool = new IdeConnectionPool(controller().signal);
    const persistent = watch(pool, remote.lock);
    const initialProbe = controller();
    const initialUpdates: FollowUpdate[] = [];
    const initialDone = pool.watch(remote.lock, "/work", initialProbe.signal, (update) => {
      initialUpdates.push(update);
      if (update.type === "selection") initialProbe.abort();
    });
    await waitFor(() => remote.initializations.length === 1);
    remote.send("selection_changed", selected);
    await initialDone;
    expect(initialUpdates).toEqual([
      { type: "selection", snapshot: selected },
      { type: "disconnected" },
    ]);
    const replayProbe = controller();
    const replayUpdates: FollowUpdate[] = [];
    await pool.watch(remote.lock, "/work/app", replayProbe.signal, (update) => {
      replayUpdates.push(update);
      if (update.type === "selection") replayProbe.abort();
    });
    expect(replayUpdates).toEqual(initialUpdates);
    expect(remote.sockets).toHaveLength(1);
    expect(remote.sockets[0]?.readyState).toBe(WebSocket.OPEN);
    const canceled = controller();
    canceled.abort();
    const canceledUpdates: FollowUpdate[] = [];
    await pool.watch(remote.lock, "/work", canceled.signal, (update) =>
      canceledUpdates.push(update),
    );
    expect(canceledUpdates).toEqual([]);
    persistent.lifetime.abort();
    await persistent.done;
    await waitFor(() => remote.sockets[0]?.readyState === WebSocket.CLOSED);
    const onlyProbe = controller();
    const onlyUpdates: FollowUpdate[] = [];
    const onlyDone = pool.watch(remote.lock, "/work", onlyProbe.signal, (update) => {
      onlyUpdates.push(update);
      if (update.type === "selection") onlyProbe.abort();
    });
    expect(onlyUpdates).toEqual([]);
    await waitFor(() => remote.initializations.length === 2);
    remote.send("selection_changed", selected);
    await onlyDone;
    expect(onlyUpdates).toEqual(initialUpdates);
    await waitFor(() => remote.sockets[1]?.readyState === WebSocket.CLOSED);
  });

  it("discards stale cache after a socket closes and closes all sockets on pool abort", async () => {
    const remote = await peer();
    const lifetime = controller();
    const pool = new IdeConnectionPool(lifetime.signal);
    const first = watch(pool, remote.lock);
    await waitFor(() => remote.initializations.length === 1);
    remote.send("selection_changed", selected);
    await waitFor(() => first.updates.length === 1);
    remote.sockets[0]?.close();
    await first.done;
    expect(first.updates.at(-1)?.type).toBe("disconnected");
    const next = watch(pool, remote.lock);
    expect(next.updates).toEqual([]);
    await waitFor(() => remote.initializations.length === 2);
    const otherRemote = await peer();
    const other = watch(pool, otherRemote.lock);
    await waitFor(() => otherRemote.initializations.length === 1);
    lifetime.abort();
    await Promise.all([next.done, other.done]);
    await waitFor(() => remote.sockets.every((socket) => socket.readyState === WebSocket.CLOSED));
    await waitFor(() =>
      otherRemote.sockets.every((socket) => socket.readyState === WebSocket.CLOSED),
    );
    const stopped = watch(pool, remote.lock);
    await stopped.done;
    expect(stopped.updates).toEqual([]);
    expect(remote.sockets).toHaveLength(2);
  });

  it("rejects uninitialized, malformed, untrusted and oversized payloads without replacing valid cache", async () => {
    const remote = await peer(false);
    const diagnostics: DiagnosticContext[] = [];
    const pool = new IdeConnectionPool(controller().signal, (_id, context) =>
      diagnostics.push(context),
    );
    const subscriber = watch(pool, remote.lock);
    await waitFor(() => remote.initializations.length === 1);
    remote.send("selection_changed", selected);
    remote.send("diagnostic_fix_requested", diagnostic);
    await pause();
    expect(subscriber.updates).toEqual([]);
    expect(diagnostics).toEqual([]);
    remote.sockets[0]?.send(
      JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        result: {
          protocolVersion: PROTOCOL_VERSION,
          server: { ide: "vscode" },
        },
      }),
    );
    remote.sockets[0]?.send("not json");
    const invalidSelections = [
      { ...selected, filePath: "/outside/file.ts", workspaceFolder: undefined },
      { ...selected, workspaceFolder: "/outside" },
      { ...selected, filePath: "relative.ts" },
      {
        ...selected,
        ranges: [
          {
            text: "bad",
            selection: { start: { line: -1, character: 0 }, end: { line: 0, character: 0 } },
          },
        ],
      },
      {
        ...selected,
        ranges: [
          {
            text: "bad",
            selection: { start: { line: 2, character: 0 }, end: { line: 1, character: 0 } },
          },
        ],
      },
      { ...selected, ranges: [{ selection: selected.ranges[0]?.selection }] },
    ];
    for (const value of invalidSelections) remote.send("selection_changed", value);
    remote.send("selection_cleared", { source: "vscode", reason: "invalid" });
    remote.send("diagnostic_requested", diagnostic);
    for (const value of [
      { ...diagnostic, filePath: "/outside/file.ts", workspaceFolder: undefined },
      { ...diagnostic, workspaceFolder: "/outside" },
      { ...diagnostic, filePath: "relative.ts" },
      {
        ...diagnostic,
        diagnostics: [{ ...diagnostic.diagnostics[0], message: "x".repeat(2_001) }],
      },
      { ...diagnostic, documentVersion: -1 },
    ])
      remote.send("diagnostic_fix_requested", value);
    await pause();
    expect(subscriber.updates).toEqual([]);
    expect(diagnostics).toEqual([]);
    remote.send("selection_changed", selected);
    await waitFor(() => subscriber.updates.length === 1);
    remote.send("selection_changed", invalidSelections[0]);
    await pause();
    expect(watch(pool, remote.lock).updates).toEqual([{ type: "selection", snapshot: selected }]);
  });

  it("settles on initialize errors, socket errors and cancellation during upgrade", async () => {
    const remote = await peer(false);
    const pool = new IdeConnectionPool(controller().signal);
    const subscriber = watch(pool, remote.lock);
    await waitFor(() => remote.initializations.length === 1);
    remote.sockets[0]?.send(
      JSON.stringify({ jsonrpc: "2.0", id: 1, error: { code: -1, message: "denied" } }),
    );
    await subscriber.done;
    expect(subscriber.updates).toEqual([{ type: "disconnected" }]);
    const canceled = watch(pool, remote.lock);
    canceled.lifetime.abort();
    await canceled.done;
    expect(canceled.updates).toEqual([{ type: "disconnected" }]);
    const stoppedServer = new WebSocketServer({ host: "127.0.0.1", port: 0 });
    await once(stoppedServer, "listening");
    const address = stoppedServer.address();
    if (typeof address !== "object" || address === null) throw new Error("missing address");
    await new Promise<void>((resolve) => stoppedServer.close(() => resolve()));
    const failed = watch(pool, createLock(address.port, AUTH_TOKEN, ["/work/app"]));
    await failed.done;
    expect(failed.updates).toEqual([{ type: "disconnected" }]);
  });

  it(
    "bounds both HTTP upgrade and JSON-RPC initialize waits",
    async () => {
      const remote = await peer(false);
      const http = createServer();
      const sockets = new Set<Socket>();
      http.on("connection", (socket) => {
        sockets.add(socket);
        socket.once("close", () => sockets.delete(socket));
      });
      http.on("upgrade", () => undefined);
      http.listen(0, "127.0.0.1");
      await once(http, "listening");
      cleanups.push(async () => {
        for (const socket of sockets) socket.destroy();
        await new Promise<void>((resolve) => http.close(() => resolve()));
      });
      const address = http.address();
      if (typeof address !== "object" || address === null) throw new Error("missing address");
      const pool = new IdeConnectionPool(controller().signal);
      const json = watch(pool, remote.lock);
      const upgrade = watch(pool, createLock(address.port, AUTH_TOKEN, ["/work/app"]));
      await Promise.all([json.done, upgrade.done]);
      expect(json.updates).toEqual([{ type: "disconnected" }]);
      expect(upgrade.updates).toEqual([{ type: "disconnected" }]);
    },
    INITIALIZATION_TEST_TIMEOUT_MS,
  );
});

async function waitFor(ready: () => boolean): Promise<void> {
  const started = Date.now();
  while (!ready()) {
    if (Date.now() - started > 2_000) throw new Error("timed out waiting for IDE status");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
