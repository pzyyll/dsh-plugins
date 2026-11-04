// ABOUTME: Verify the browser status stream authorizes, filters, and follows live selections.
// ABOUTME: Use a real HTTP response and the IDE server without sending selected text.
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Context, type Plugin } from "@deepseek-ai/cordis";
import { WebServer } from "@deepseek-ai/dsh-host-webserver";
import { SessionId, SessionStore } from "@deepseek-ai/dsh-session";
import { AgentRegistry } from "@deepseek-ai/dsh-agent";
import * as selectionPlugin from "../../src/dsh/index.js";
import { IdeConnections } from "../../src/dsh/ide-connections.js";
import { ideLockId } from "../../src/shared/ide.js";
import { createLock, writeLock } from "../../src/shared/lock.js";
import type { EditorSelectionSnapshot } from "../../src/shared/protocol.js";
import { IdeServer } from "../../src/shared/server.js";
import {
  SELECTION_EVENTS_PATH,
  statusFromUpdate,
  type IdeEvent,
  handleSelectionStream,
  registerSelectionStatus,
} from "../../src/dsh/status-stream.js";

const TIMEOUT_MS = 1_000;
const MAX_AGE_MS = 60_000;
const WORKSPACE = "/work/app";
const roots: string[] = [];
const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  await Promise.all(closers.splice(0).map((close) => close()));
  await Promise.all(roots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

const selected: EditorSelectionSnapshot = {
  source: "vscode",
  filePath: "/work/app/src/example.ts",
  workspaceFolder: "/work/app",
  ranges: [
    {
      text: "secret selection",
      selection: { start: { line: 9, character: 0 }, end: { line: 11, character: 1 } },
    },
  ],
};

describe("selection status stream", () => {
  it("streams an authenticated live session through the actual plugin and WebServer scopes", async () => {
    const dir = await mkdtemp(join(tmpdir(), "dsh-status-scope-"));
    roots.push(dir);
    const ide = new IdeServer("a".repeat(64), () => selected);
    closers.push(() => ide.stop());
    const port = await ide.start();
    await writeLock(join(dir, "vscode.lock"), createLock(port, "a".repeat(64), ["/work/app"]));
    const ctx = new Context();
    closers.push(async () => {
      await ctx.fiber.dispose();
    });
    await ctx.plugin(SessionStore);
    await ctx.plugin(AgentRegistry);
    await ctx.plugin(WebServer, { host: "127.0.0.1", port: 0 });
    let authorized = false;
    await ctx.plugin({
      name: "status-test-authorization",
      apply(scope: Context) {
        scope.provide("connection", { requestRejection: () => (authorized ? undefined : 401) });
      },
    });
    await ctx.plugin(selectionPlugin, { lockDir: dir });
    const session = ctx.sessions.create(undefined, { meta: { cwd: "/work/app" } });
    const endpoint = `${ctx.webServer.getOrigin()}${SELECTION_EVENTS_PATH}?session=${encodeURIComponent(session.id)}`;
    expect((await fetch(endpoint)).status).toBe(401);
    authorized = true;
    const response = await fetch(endpoint);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    if (!response.body) throw new Error("missing authenticated status stream");
    const reader = response.body.getReader();
    closers.push(async () => {
      await reader.cancel();
    });
    const text = await readUntil(reader, "Lines Selected");
    expect(text).toContain("src/example.ts #L10-L12");
    expect(text).not.toContain("secret selection");
  });

  it("waits for late services, follows dependency restarts, and removes its real HTTP route", async () => {
    const ctx = new Context();
    const lifetime = new AbortController();
    const registration = await ctx.plugin({
      name: "status-route-registration-test",
      apply(scope: Context) {
        const options = {
          lockDir: "/unused",
          maxAgeMs: 1_000,
          timeoutMs: 1_000,
          signal: lifetime.signal,
        };
        registerSelectionStatus(scope, { ...options, connections: new IdeConnections(options) });
      },
    });
    closers.push(async () => {
      lifetime.abort();
      await registration.dispose();
    });
    const web = await ctx.plugin(WebServer, { host: "127.0.0.1", port: 0 });
    closers.push(async () => {
      await web.dispose();
    });
    const endpoint = `${ctx.webServer.getOrigin()}${SELECTION_EVENTS_PATH}`;
    expect((await fetch(endpoint)).status).toBe(404);
    const authorization: Plugin = {
      name: "status-authorization-test",
      apply(scope) {
        scope.provide("connection", { requestRejection: () => 401 });
      },
    };
    const connection = await ctx.plugin(authorization);
    expect((await fetch(endpoint)).status).toBe(404);
    const sessions = await ctx.plugin(SessionStore);
    closers.push(async () => {
      await sessions.dispose();
    });
    await vi.waitFor(async () => expect((await fetch(endpoint)).status).toBe(401));
    await connection.dispose();
    expect((await fetch(endpoint)).status).toBe(404);
    const restarted = await ctx.plugin(authorization);
    closers.push(async () => {
      await restarted.dispose();
    });
    await vi.waitFor(async () => expect((await fetch(endpoint)).status).toBe(401));
    await sessions.dispose();
    expect((await fetch(endpoint)).status).toBe(404);
    const restoredSessions = await ctx.plugin(SessionStore);
    closers.push(async () => {
      await restoredSessions.dispose();
    });
    await vi.waitFor(async () => expect((await fetch(endpoint)).status).toBe(401));
    await registration.dispose();
    expect((await fetch(endpoint)).status).toBe(404);
  });

  it("switches the live status with the session target without changing another session", async () => {
    const dir = await mkdtemp(join(tmpdir(), "dsh-status-target-"));
    roots.push(dir);
    const lifetime = new AbortController();
    closers.push(async () => lifetime.abort());
    const local = new IdeServer("a".repeat(64), () => selected);
    const manual = new IdeServer("b".repeat(64), () => ({
      ...selected,
      filePath: "/work/app/other/manual.ts",
      workspaceFolder: "/work/app/other",
    }));
    closers.push(
      () => local.stop(),
      () => manual.stop(),
    );
    const localPort = await local.start();
    const manualPort = await manual.start();
    const manualLock = createLock(manualPort, "b".repeat(64), ["/work/app/other"]);
    await writeLock(join(dir, "local.lock"), createLock(localPort, "a".repeat(64), ["/work/app"]));
    await writeLock(join(dir, "manual.lock"), manualLock);
    const options = { lockDir: dir, maxAgeMs: 60_000, signal: lifetime.signal };
    const connections = new IdeConnections({ ...options, timeoutMs: TIMEOUT_MS });
    const first: unknown[] = [];
    const second: unknown[] = [];
    const sessionOne = SessionId("status-session-one");
    const stopFirst = connections.watch(sessionOne, WORKSPACE, (update) =>
      first.push(
        connections.getTarget(sessionOne).kind === "off"
          ? { connected: false, disabled: true }
          : statusFromUpdate(update),
      ),
    );
    const stopSecond = connections.watch(SessionId("status-session-two"), WORKSPACE, (update) =>
      second.push(statusFromUpdate(update)),
    );
    closers.push(async () => {
      stopFirst();
      stopSecond();
    });
    await vi.waitFor(() =>
      expect(first.at(-1)).toMatchObject({ detail: "src/example.ts #L10-L12" }),
    );
    await connections.select(sessionOne, ideLockId(manualLock), "/work/app", lifetime.signal);
    await vi.waitFor(() => expect(first.at(-1)).toMatchObject({ detail: "manual.ts #L10-L12" }));
    expect(second.at(-1)).toMatchObject({ detail: "src/example.ts #L10-L12" });
    connections.setMode(sessionOne, "off");
    expect(first.at(-1)).toEqual({ connected: false, disabled: true });
    connections.setMode(sessionOne, "auto");
    await vi.waitFor(() =>
      expect(first.at(-1)).toMatchObject({ detail: "src/example.ts #L10-L12" }),
    );
    expect(JSON.stringify(first)).not.toContain("secret selection");
  });

  it("rejects unauthorized and incomplete requests", async () => {
    const server = createServer((request, response) => {
      handleSelectionStream(request, response, {
        authorize: () => 401,
        subscribe: () => () => undefined,
      });
    });
    closers.push(() => closeServer(server));
    const port = await listen(server);
    const denied = await fetch(`http://127.0.0.1:${port}${SELECTION_EVENTS_PATH}?session=one`);
    expect(denied.status).toBe(401);

    const open = createServer((request, response) => {
      handleSelectionStream(request, response, {
        authorize: () => undefined,
        subscribe: () => () => undefined,
      });
    });
    closers.push(() => closeServer(open));
    const openPort = await listen(open);
    const missing = await fetch(`http://127.0.0.1:${openPort}${SELECTION_EVENTS_PATH}`);
    expect(missing.status).toBe(400);
  });

  it("pushes the connected label and hover detail without selected text", async () => {
    const dir = await mkdtemp(join(tmpdir(), "dsh-status-stream-"));
    roots.push(dir);
    const ide = new IdeServer("b".repeat(64), () => selected);
    closers.push(() => ide.stop());
    const port = await ide.start();
    await writeLock(join(dir, "vscode.lock"), createLock(port, "b".repeat(64), ["/work/app"]));
    const lifetime = new AbortController();
    closers.push(async () => lifetime.abort());
    const connections = new IdeConnections({
      lockDir: dir,
      maxAgeMs: MAX_AGE_MS,
      timeoutMs: TIMEOUT_MS,
      signal: lifetime.signal,
    });
    const http = createServer((request, response) => {
      request.resume();
      handleSelectionStream<IdeEvent>(request, response, {
        authorize: () => undefined,
        subscribe: (sessionId, listener) =>
          connections.watch(SessionId(sessionId), WORKSPACE, (update) =>
            listener({ type: "status", ...statusFromUpdate(update) }),
          ),
        signal: lifetime.signal,
      });
    });
    closers.push(() => closeServer(http));
    const httpPort = await listen(http);
    const response = await fetch(
      `http://127.0.0.1:${httpPort}${SELECTION_EVENTS_PATH}?session=live`,
    );
    expect(response.status).toBe(200);
    const body = response.body;
    if (!body) throw new Error("missing status stream");
    const reader = body.getReader();
    closers.push(async () => {
      await reader.cancel();
    });
    const text = await readUntil(reader, "Lines Selected");
    expect(text).toContain(
      '{"type":"status","connected":true,"text":"⧉ 3 Lines Selected","lines":3,"detail":"src/example.ts #L10-L12"}',
    );
    expect(text).not.toContain("secret selection");
    ide.broadcast({
      ...selected,
      ranges: [
        {
          text: "another secret",
          selection: { start: { line: 19, character: 0 }, end: { line: 20, character: 1 } },
        },
      ],
    });
    const changed = await readUntil(reader, "#L20-L21");
    expect(changed).toContain("2 Lines Selected");
    expect(changed).not.toContain("another secret");
    lifetime.abort();
    // Shutdown can emit a final disconnected status before ending the response.
    let ended = false;
    while (!ended) {
      const chunk = await reader.read();
      ended = chunk.done;
      if (chunk.value) expect(new TextDecoder().decode(chunk.value)).not.toContain("secret");
    }
    expect(ended).toBe(true);
  });
});

function listen(server: ReturnType<typeof createServer>): Promise<number> {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string")
        throw new Error("status test server did not bind");
      resolve(address.port);
    });
  });
}

function closeServer(server: ReturnType<typeof createServer>): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}

async function readUntil(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  marker: string,
): Promise<string> {
  const decoder = new TextDecoder();
  let text = "";
  const started = Date.now();
  while (!text.includes(marker)) {
    if (Date.now() - started > 2_000) throw new Error(`timed out reading status stream: ${text}`);
    const chunk = await reader.read();
    if (chunk.done) break;
    text += decoder.decode(chunk.value, { stream: true });
  }
  return text;
}
