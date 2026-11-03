// ABOUTME: Tests one-shot IDE selection reads over authenticated JSON-RPC WebSockets.
// ABOUTME: Ensures failed candidates are skipped and invalid wire data cannot be returned.
import { mkdtemp, rm } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { Duplex } from "node:stream";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createLock, writeLock } from "./lock.js";
import { readSelection } from "./client.js";
import { IdeServer } from "./server.js";
import type { EditorSelectionSnapshot } from "./protocol.js";
const roots: string[] = [];
const servers: IdeServer[] = [];
const stalledServers: Server[] = [];
const stalledSockets = new Set<Duplex>();
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.stop()));
  for (const socket of stalledSockets) socket.destroy();
  stalledSockets.clear();
  await Promise.all(
    stalledServers
      .splice(0)
      .map((server) => new Promise<void>((resolve) => server.close(() => resolve()))),
  );
  await Promise.all(roots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});
const snapshot: EditorSelectionSnapshot = {
  source: "vscode",
  filePath: "/work/app/file.ts",
  workspaceFolder: "/work/app",
  ranges: [
    {
      text: "selected",
      selection: { start: { line: 1, character: 2 }, end: { line: 1, character: 10 } },
    },
  ],
};
async function startStalledUpgradeServer(): Promise<number> {
  const server = createServer();
  server.on("upgrade", (_request, socket) => {
    stalledSockets.add(socket);
    socket.once("close", () => stalledSockets.delete(socket));
  });
  stalledServers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("failed to start stalled server");
  return address.port;
}

describe("readSelection", () => {
  it("discovers, initializes, and returns the validated snapshot", async () => {
    const dir = await mkdtemp(join(tmpdir(), "dsh-client-test-"));
    roots.push(dir);
    const server = new IdeServer("d".repeat(64), () => snapshot);
    servers.push(server);
    const port = await server.start();
    await writeLock(join(dir, "live.lock"), createLock(port, "d".repeat(64), ["/work/app"]));
    await expect(
      readSelection({
        cwd: "/work/app",
        lockDir: dir,
        timeoutMs: 1000,
        maxAgeMs: 60_000,
        signal: new AbortController().signal,
      }),
    ).resolves.toEqual(expect.objectContaining(snapshot));
  });
  it("tries the next ranked lock after connection failure", async () => {
    const dir = await mkdtemp(join(tmpdir(), "dsh-client-fallback-"));
    roots.push(dir);
    const server = new IdeServer("e".repeat(64), () => snapshot);
    servers.push(server);
    const port = await server.start();
    await writeLock(join(dir, "dead.lock"), createLock(1, "f".repeat(64), ["/work/app/src"]));
    await writeLock(join(dir, "live.lock"), createLock(port, "e".repeat(64), ["/work/app"]));
    await expect(
      readSelection({
        cwd: "/work/app/src/file.ts",
        lockDir: dir,
        timeoutMs: 250,
        maxAgeMs: 60_000,
        signal: new AbortController().signal,
      }),
    ).resolves.toEqual(expect.objectContaining(snapshot));
  });
  it("ignores snapshots with unsafe paths or invalid range positions", async () => {
    const badSnapshots: unknown[] = [
      { ...snapshot, filePath: "/work/other/file.ts" },
      {
        ...snapshot,
        ranges: [
          {
            text: "bad",
            selection: { start: { line: 2, character: 0 }, end: { line: 1, character: 0 } },
          },
        ],
      },
    ];
    for (const [index, value] of badSnapshots.entries()) {
      const dir = await mkdtemp(join(tmpdir(), `dsh-client-invalid-${index}-`));
      roots.push(dir);
      const token = "a".repeat(64);
      let selectionRequested = false;
      const server = new IdeServer(token, () => {
        selectionRequested = true;
        return value as EditorSelectionSnapshot;
      });
      servers.push(server);
      const port = await server.start();
      await writeLock(join(dir, `invalid-${index}.lock`), createLock(port, token, ["/work/app"]));
      await expect(
        readSelection({
          cwd: "/work/app",
          lockDir: dir,
          timeoutMs: 50,
          maxAgeMs: 60_000,
          signal: new AbortController().signal,
        }),
      ).resolves.toBeUndefined();
      expect(selectionRequested).toBe(true);
    }
  });
  it("tries the next lock immediately after an invalid snapshot", async () => {
    const dir = await mkdtemp(join(tmpdir(), "dsh-client-invalid-fallback-"));
    roots.push(dir);
    const token = "a".repeat(64);
    const invalid = new IdeServer(token, () => ({ ...snapshot, filePath: "/outside/file.ts" }));
    const valid = new IdeServer(token, () => snapshot);
    servers.push(invalid, valid);
    const invalidPort = await invalid.start();
    const validPort = await valid.start();
    await writeLock(join(dir, "invalid.lock"), createLock(invalidPort, token, ["/work/app/src"]));
    await writeLock(join(dir, "valid.lock"), createLock(validPort, token, ["/work/app"]));
    await expect(
      readSelection({
        cwd: "/work/app/src",
        lockDir: dir,
        timeoutMs: 1_000,
        maxAgeMs: 60_000,
        signal: new AbortController().signal,
      }),
    ).resolves.toEqual(expect.objectContaining(snapshot));
  });
  it("treats a valid clear as authoritative instead of falling through to another lock", async () => {
    const dir = await mkdtemp(join(tmpdir(), "dsh-client-cleared-"));
    roots.push(dir);
    const clearServer = new IdeServer("1".repeat(64), () => undefined);
    servers.push(clearServer);
    const liveServer = new IdeServer("2".repeat(64), () => snapshot);
    servers.push(liveServer);
    const clearPort = await clearServer.start();
    const livePort = await liveServer.start();
    await writeLock(
      join(dir, "deep-clear.lock"),
      createLock(clearPort, "1".repeat(64), ["/work/app/src"]),
    );
    await writeLock(
      join(dir, "shallow-live.lock"),
      createLock(livePort, "2".repeat(64), ["/work/app"]),
    );
    await expect(
      readSelection({
        cwd: "/work/app/src/file.ts",
        lockDir: dir,
        timeoutMs: 500,
        maxAgeMs: 60_000,
        signal: new AbortController().signal,
      }),
    ).resolves.toBeUndefined();
  });
  it("bounds the full fallback sequence by one global timeout", async () => {
    const dir = await mkdtemp(join(tmpdir(), "dsh-client-deadline-"));
    roots.push(dir);
    const port = await startStalledUpgradeServer();
    await writeLock(join(dir, "one.lock"), createLock(port, "3".repeat(64), ["/work/app"]));
    await writeLock(join(dir, "two.lock"), createLock(port, "3".repeat(64), ["/work/app"]));
    const startedAt = Date.now();
    await expect(
      readSelection({
        cwd: "/work/app",
        lockDir: dir,
        timeoutMs: 200,
        maxAgeMs: 60_000,
        signal: new AbortController().signal,
      }),
    ).resolves.toBeUndefined();
    expect(Date.now() - startedAt).toBeLessThan(350);
  });
  it("cancels while the WebSocket is connecting without leaking socket errors", async () => {
    const dir = await mkdtemp(join(tmpdir(), "dsh-client-cancel-"));
    roots.push(dir);
    const port = await startStalledUpgradeServer();
    await writeLock(join(dir, "connecting.lock"), createLock(port, "4".repeat(64), ["/work/app"]));
    const controller = new AbortController();
    const pending = readSelection({
      cwd: "/work/app",
      lockDir: dir,
      timeoutMs: 1000,
      maxAgeMs: 60_000,
      signal: controller.signal,
    });
    setTimeout(() => controller.abort(), 10);
    await expect(pending).resolves.toBeUndefined();
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
  it("returns undefined promptly when aborted", async () => {
    const dir = await mkdtemp(join(tmpdir(), "dsh-client-abort-"));
    roots.push(dir);
    const controller = new AbortController();
    controller.abort();
    await expect(
      readSelection({
        cwd: "/work/app",
        lockDir: dir,
        timeoutMs: 1000,
        maxAgeMs: 60_000,
        signal: controller.signal,
      }),
    ).resolves.toBeUndefined();
  });
});
