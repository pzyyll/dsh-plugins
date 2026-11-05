// ABOUTME: Tests one-shot IDE selection reads over authenticated JSON-RPC WebSockets.
// ABOUTME: Ensures failed candidates are skipped and invalid wire data cannot be returned.
import { mkdtemp, rm } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { Duplex } from "node:stream";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createLock, writeLock } from "../../src/shared/lock.js";
import { listIdeTargets, readSelection } from "../../src/shared/client.js";
import { ideLockId } from "../../src/shared/ide.js";
import { IdeServer } from "../../src/shared/server.js";
import type { EditorSelectionSnapshot } from "../../src/shared/protocol.js";
// Allow live handshakes under full-suite load; deadline tests set their own shorter budget.
const LIVE_SELECTION_TIMEOUT_MS = 1_000;
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
    const descendantSnapshot = {
      ...snapshot,
      filePath: "/work/app/src/file.ts",
      workspaceFolder: "/work/app/src",
    };
    const descendant = new IdeServer("e".repeat(64), () => descendantSnapshot);
    servers.push(descendant);
    const descendantPort = await descendant.start();
    await writeLock(join(dir, "dead.lock"), createLock(1, "f".repeat(64), ["/work/app"]));
    await writeLock(
      join(dir, "live.lock"),
      createLock(descendantPort, "e".repeat(64), ["/work/app/src"]),
    );
    await expect(
      readSelection({
        cwd: "/work/app",
        lockDir: dir,
        timeoutMs: LIVE_SELECTION_TIMEOUT_MS,
        maxAgeMs: 60_000,
        signal: new AbortController().signal,
      }),
    ).resolves.toEqual(expect.objectContaining(descendantSnapshot));
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
          timeoutMs: LIVE_SELECTION_TIMEOUT_MS,
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
    const descendantSnapshot = {
      ...snapshot,
      filePath: "/work/app/src/file.ts",
      workspaceFolder: "/work/app/src",
    };
    const valid = new IdeServer(token, () => descendantSnapshot);
    servers.push(invalid, valid);
    const invalidPort = await invalid.start();
    const validPort = await valid.start();
    await writeLock(join(dir, "invalid.lock"), createLock(invalidPort, token, ["/work/app"]));
    await writeLock(join(dir, "valid.lock"), createLock(validPort, token, ["/work/app/src"]));
    await expect(
      readSelection({
        cwd: "/work/app",
        lockDir: dir,
        timeoutMs: 1_000,
        maxAgeMs: 60_000,
        signal: new AbortController().signal,
      }),
    ).resolves.toEqual(expect.objectContaining(descendantSnapshot));
  });
  it("treats a valid clear as authoritative instead of falling through to another lock", async () => {
    const dir = await mkdtemp(join(tmpdir(), "dsh-client-cleared-"));
    roots.push(dir);
    const clearServer = new IdeServer("1".repeat(64), () => undefined);
    servers.push(clearServer);
    const descendantSnapshot = {
      ...snapshot,
      filePath: "/work/app/src/file.ts",
      workspaceFolder: "/work/app/src",
    };
    const liveServer = new IdeServer("2".repeat(64), () => descendantSnapshot);
    servers.push(liveServer);
    const clearPort = await clearServer.start();
    const livePort = await liveServer.start();
    await writeLock(
      join(dir, "deep-clear.lock"),
      createLock(clearPort, "1".repeat(64), ["/work/app"]),
    );
    await writeLock(
      join(dir, "shallow-live.lock"),
      createLock(livePort, "2".repeat(64), ["/work/app/src"]),
    );
    await expect(
      readSelection({
        cwd: "/work/app",
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

describe("listIdeTargets", () => {
  it("lists every reachable IDE and marks the workspace-matched automatic target", async () => {
    const dir = await mkdtemp(join(tmpdir(), "dsh-client-targets-"));
    roots.push(dir);
    const local = new IdeServer("5".repeat(64), () => undefined);
    const descendant = new IdeServer("8".repeat(64), () => undefined);
    const remote = new IdeServer("6".repeat(64), () => undefined);
    servers.push(local, descendant, remote);
    const localPort = await local.start();
    const descendantPort = await descendant.start();
    const remotePort = await remote.start();
    const localLock = createLock(localPort, "5".repeat(64), ["/work/app/src"]);
    const descendantLock = createLock(descendantPort, "8".repeat(64), ["/work/app/src/nested"]);
    const remoteLock = createLock(remotePort, "6".repeat(64), ["/other/project"]);
    await writeLock(join(dir, "local.lock"), localLock);
    await writeLock(join(dir, "descendant.lock"), descendantLock);
    await writeLock(join(dir, "remote.lock"), remoteLock);

    const targets = await listIdeTargets({
      cwd: "/work/app/src",
      lockDir: dir,
      timeoutMs: 1_000,
      maxAgeMs: 60_000,
      signal: new AbortController().signal,
    });

    expect(targets.ides.map((ide) => ide.id).sort()).toEqual(
      [ideLockId(localLock), ideLockId(descendantLock), ideLockId(remoteLock)].sort(),
    );
    expect(targets.ides).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: ideLockId(localLock), workspaceMatched: true }),
        expect.objectContaining({ id: ideLockId(descendantLock), workspaceMatched: true }),
        expect.objectContaining({ id: ideLockId(remoteLock), workspaceMatched: false }),
      ]),
    );
    expect(targets.automaticId).toBe(ideLockId(localLock));
  });

  it("omits the automatic target when no reachable IDE contains the workspace", async () => {
    const dir = await mkdtemp(join(tmpdir(), "dsh-client-targets-none-"));
    roots.push(dir);
    const remote = new IdeServer("7".repeat(64), () => undefined);
    servers.push(remote);
    const port = await remote.start();
    await writeLock(join(dir, "remote.lock"), createLock(port, "7".repeat(64), ["/other/project"]));

    const targets = await listIdeTargets({
      cwd: "/work/app",
      lockDir: dir,
      timeoutMs: 1_000,
      maxAgeMs: 60_000,
      signal: new AbortController().signal,
    });

    expect(targets.ides).toHaveLength(1);
    expect(targets.ides[0]).toMatchObject({
      workspaceFolders: ["/other/project"],
      workspaceMatched: false,
    });
    expect(targets.automaticId).toBeUndefined();
  });
});
