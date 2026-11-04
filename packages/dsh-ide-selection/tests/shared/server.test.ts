// ABOUTME: Tests authenticated loopback WebSocket hosting and JSON-RPC selection notifications.
// ABOUTME: Exercises origin rejection, initialize snapshots, broadcasts, attach, and shutdown.
import WebSocket from "ws";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AUTH_HEADER,
  type DiagnosticContext,
  type EditorSelectionSnapshot,
} from "../../src/shared/protocol.js";
import { MAX_DIAGNOSTIC_MESSAGE_CHARS } from "../../src/shared/diagnostics.js";
import { IdeServer, type IdeConnectionStatus } from "../../src/shared/server.js";

const servers: IdeServer[] = [];
afterEach(async () => Promise.all(servers.splice(0).map((server) => server.stop())));
const selection: EditorSelectionSnapshot = {
  source: "vscode",
  filePath: "/work/app/src/a.ts",
  workspaceFolder: "/work/app",
  ranges: [
    { text: "x", selection: { start: { line: 2, character: 0 }, end: { line: 2, character: 1 } } },
  ],
};
const diagnosticContext: DiagnosticContext = {
  source: "vscode",
  filePath: "/work/app/src/a.ts",
  workspaceFolder: "/work/app",
  documentVersion: 1,
  diagnostics: [
    {
      severity: "error",
      message: "Unknown name",
      range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
      selectedText: "x",
      contextLines: [{ line: 0, text: "x" }],
    },
  ],
};
function createServer(snapshot: EditorSelectionSnapshot | undefined = selection): IdeServer {
  const server = new IdeServer("c".repeat(64), () => snapshot);
  servers.push(server);
  return server;
}
function messageReader(socket: WebSocket): () => Promise<unknown> {
  const queued: unknown[] = [];
  const waiters: Array<(value: unknown) => void> = [];
  socket.on("message", (data) => {
    const value: unknown = JSON.parse(data.toString());
    const waiter = waiters.shift();
    if (waiter) waiter(value);
    else queued.push(value);
  });
  return () =>
    queued.length
      ? Promise.resolve(queued.shift())
      : new Promise((resolve) => waiters.push(resolve));
}
function open(url: string, headers: Record<string, string>): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url, { headers });
    socket.once("open", () => resolve(socket));
    socket.once("error", reject);
  });
}

describe("IdeServer", () => {
  it("publishes normal connection and disconnect counts without initialization or selection gestures", async () => {
    const server = createServer();
    const port = await server.start();
    const updates: IdeConnectionStatus[] = [];
    const unsubscribe = server.subscribeConnections((status) => updates.push(status));
    expect(updates).toEqual([{ clientCount: 0 }]);

    const selectionClient = await open(`ws://127.0.0.1:${port}`, { [AUTH_HEADER]: "c".repeat(64) });
    await vi.waitFor(() => expect(updates.at(-1)?.clientCount).toBe(1));
    expect(updates.at(-1)).toEqual({ clientCount: 1 });
    const inputClient = await open(`ws://127.0.0.1:${port}`, { [AUTH_HEADER]: "c".repeat(64) });
    await vi.waitFor(() => expect(updates.at(-1)).toEqual({ clientCount: 2 }));
    inputClient.close();
    await vi.waitFor(() => expect(updates.at(-1)).toEqual({ clientCount: 1 }));
    unsubscribe();
    const previousUpdates = updates.length;
    selectionClient.close();
    await server.stop();
    expect(server.clientCount).toBe(0);
    expect(updates).toHaveLength(previousUpdates);
  });

  it("forwards both actions only to the first open client, regardless of initialize cwd", async () => {
    const server = createServer();
    const port = await server.start();
    const first = await open(`ws://127.0.0.1:${port}`, { [AUTH_HEADER]: "c".repeat(64) });
    const firstMessage = messageReader(first);
    first.send(
      JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: { cwd: "/other/workspace" },
      }),
    );
    await firstMessage();
    await firstMessage();
    const second = await open(`ws://127.0.0.1:${port}`, { [AUTH_HEADER]: "c".repeat(64) });
    const secondMessage = messageReader(second);

    for (const action of ["fix", "send-diagnostic"] as const) {
      const context = { ...diagnosticContext, action };
      expect(server.sendDiagnostics(context)).toBe(true);
      expect(await firstMessage()).toEqual({
        jsonrpc: "2.0",
        method: "diagnostic_fix_requested",
        params: context,
      });
    }
    // A subsequent broadcast is an ordered barrier: neither socket has duplicate actions queued.
    server.broadcast(undefined);
    expect(await firstMessage()).toMatchObject({ method: "selection_cleared" });
    expect(await secondMessage()).toMatchObject({ method: "selection_cleared" });
    first.close();
    await vi.waitFor(() => expect(server.clientCount).toBe(1));
    expect(server.sendDiagnostics(diagnosticContext)).toBe(true);
    expect(await secondMessage()).toMatchObject({ method: "diagnostic_fix_requested" });
    second.close();
    await vi.waitFor(() => expect(server.clientCount).toBe(0));
    expect(server.sendDiagnostics(diagnosticContext)).toBe(false);
  });

  it("rejects unbounded or nonabsolute diagnostic context before sending", async () => {
    const server = createServer();
    const port = await server.start();
    const socket = await open(`ws://127.0.0.1:${port}`, { [AUTH_HEADER]: "c".repeat(64) });
    const nextMessage = messageReader(socket);
    const oversized = {
      ...diagnosticContext,
      diagnostics: [
        {
          ...diagnosticContext.diagnostics[0]!,
          message: "x".repeat(MAX_DIAGNOSTIC_MESSAGE_CHARS + 1),
        },
      ],
    };
    for (const invalid of [
      { ...diagnosticContext, filePath: "relative.ts" },
      { ...diagnosticContext, workspaceFolder: "relative" },
      { ...diagnosticContext, filePath: "bad\0path" },
      oversized,
    ])
      expect(server.sendDiagnostics(invalid)).toBe(false);
    server.broadcast(undefined);
    expect(await nextMessage()).toMatchObject({ method: "selection_cleared" });
    socket.close();
  });

  it("requires the token and rejects browser origins", async () => {
    const server = createServer();
    const port = await server.start();
    const denied = new WebSocket(`ws://127.0.0.1:${port}`, { headers: { [AUTH_HEADER]: "wrong" } });
    await expect(
      new Promise((resolve, reject) => {
        denied.once("open", () => resolve("open"));
        denied.once("error", reject);
      }),
    ).rejects.toBeDefined();
    const origin = new WebSocket(`ws://127.0.0.1:${port}`, {
      headers: { [AUTH_HEADER]: "c".repeat(64), origin: "https://browser.example" },
    });
    await expect(
      new Promise((resolve, reject) => {
        origin.once("open", () => resolve("open"));
        origin.once("error", reject);
      }),
    ).rejects.toBeDefined();
  });

  it("closes and reports when the selection provider throws", async () => {
    const server = new IdeServer("c".repeat(64), () => {
      throw new Error("editor provider failed");
    });
    servers.push(server);
    const port = await server.start();
    const socket = await open(`ws://127.0.0.1:${port}`, { [AUTH_HEADER]: "c".repeat(64) });
    socket.send(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }));
    const closed = new Promise<number>((resolve) => socket.once("close", (code) => resolve(code)));
    await expect(closed).resolves.toBe(1011);
  });

  it("initializes then sends current selection and supports change/clear/attach notifications", async () => {
    const server = createServer();
    const port = await server.start();
    const socket = await open(`ws://127.0.0.1:${port}`, { [AUTH_HEADER]: "c".repeat(64) });
    const nextMessage = messageReader(socket);
    socket.send(
      JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: { protocolVersion: 1 },
      }),
    );
    expect(await nextMessage()).toMatchObject({
      jsonrpc: "2.0",
      id: 1,
      result: { protocolVersion: 1, server: { name: "DSH IDE Selection", ide: "vscode" } },
    });
    expect(await nextMessage()).toMatchObject({
      jsonrpc: "2.0",
      method: "selection_changed",
      params: { filePath: selection.filePath },
    });
    server.broadcast(selection);
    expect(await nextMessage()).toMatchObject({
      method: "selection_changed",
      params: { filePath: selection.filePath },
    });
    server.broadcast(undefined);
    expect(await nextMessage()).toMatchObject({
      method: "selection_cleared",
      params: { source: "vscode", reason: "no-active-editor" },
    });
    server.attach(selection);
    expect(await nextMessage()).toMatchObject({
      method: "at_mentioned",
      params: { filePath: selection.filePath, rangeText: "@src/a.ts#L3" },
    });
    socket.close();
  });
});
