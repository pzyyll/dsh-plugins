// ABOUTME: Test live IDE discovery and explicit selection across workspace boundaries.
// ABOUTME: Keep unavailable IDEs, credentials, and selected text out of picker results.
import { mkdtemp, rm } from "node:fs/promises";
import { createServer, type Server, type Socket } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { listAvailableIde, readSelection } from "../../src/shared/client.js";
import { ideLockId } from "../../src/shared/ide.js";
import { createLock, writeLock } from "../../src/shared/lock.js";
import type { EditorSelectionSnapshot } from "../../src/shared/protocol.js";
import { IdeServer } from "../../src/shared/server.js";

const TIMEOUT_MS = 1_000;
const MAX_AGE_MS = 60_000;
const LIST_TIMEOUT_MS = 1_000;
const roots: string[] = [];
const servers: IdeServer[] = [];
const stalledServers: Server[] = [];
const stalledSockets = new Set<Socket>();
afterEach(async () => {
  for (const socket of stalledSockets) socket.destroy();
  stalledSockets.clear();
  await Promise.all(
    stalledServers
      .splice(0)
      .map((server) => new Promise<void>((resolve) => server.close(() => resolve()))),
  );
  await Promise.all(servers.splice(0).map((server) => server.stop()));
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function setup() {
  const lockDir = await mkdtemp(join(tmpdir(), "dsh-ide-picker-"));
  roots.push(lockDir);
  const signal = new AbortController().signal;
  return { lockDir, cwd: "/work/app", timeoutMs: TIMEOUT_MS, maxAgeMs: MAX_AGE_MS, signal };
}

async function addIde(lockDir: string, workspace: string, text: string) {
  const snapshot: EditorSelectionSnapshot = {
    source: "vscode",
    filePath: `${workspace}/selected.ts`,
    workspaceFolder: workspace,
    ranges: [
      { text, selection: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } } },
    ],
  };
  const server = new IdeServer("a".repeat(64), () => snapshot);
  servers.push(server);
  const port = await server.start();
  const lock = createLock(port, "a".repeat(64), [workspace]);
  await writeLock(join(lockDir, `vscode-${port}.lock`), lock);
  return { server, lock, snapshot };
}

describe("manual IDE targets", () => {
  it("lists reachable IDEs from other workspaces without exposing credentials or text", async () => {
    const options = await setup();
    const local = await addIde(options.lockDir, options.cwd, "local secret");
    const remoteWorkspace = await addIde(options.lockDir, "/other/project", "other secret");
    const unavailable = await addIde(options.lockDir, "/unavailable", "unavailable secret");
    await unavailable.server.stop();

    const available = await listAvailableIde(options);
    expect(available.map((ide) => ide.id)).toEqual([
      ideLockId(local.lock),
      ideLockId(remoteWorkspace.lock),
    ]);
    expect(available[0]).toMatchObject({
      id: ideLockId(local.lock),
      workspaceFolders: ["/work/app"],
      workspaceMatched: true,
    });
    expect(available[1]).toMatchObject({
      id: ideLockId(remoteWorkspace.lock),
      name: "Visual Studio Code",
      workspaceFolders: ["/other/project"],
      workspaceMatched: false,
    });
    expect(JSON.stringify(available)).not.toContain("secret");
    expect(JSON.stringify(available)).not.toContain(local.lock.authToken);
  });

  it("uses an explicit descendant IDE and reads a fresh snapshot", async () => {
    const options = await setup();
    const local = await addIde(options.lockDir, options.cwd, "local");
    const manual = await addIde(options.lockDir, "/work/app/other", "manual");
    expect(await readSelection(options)).toEqual(expect.objectContaining(local.snapshot));
    expect(await readSelection({ ...options, ideId: ideLockId(manual.lock) })).toEqual(
      expect.objectContaining(manual.snapshot),
    );
  });

  it("rejects a mismatching manual read while retaining it in the all-IDE list", async () => {
    const options = await setup();
    const local = await addIde(options.lockDir, options.cwd, "local");
    const remote = await addIde(options.lockDir, "/other/project", "remote");

    expect(await readSelection({ ...options, ideId: ideLockId(remote.lock) })).toBeUndefined();
    const available = await listAvailableIde(options);
    expect(available.map((ide) => ide.id)).toEqual([ideLockId(local.lock), ideLockId(remote.lock)]);
    expect(available.find((ide) => ide.id === ideLockId(remote.lock))).toMatchObject({
      workspaceFolders: ["/other/project"],
      workspaceMatched: false,
    });
  });

  it("does not fall back to another IDE when the explicit target is unavailable", async () => {
    const options = await setup();
    await addIde(options.lockDir, options.cwd, "local");
    const manual = await addIde(options.lockDir, "/work/app/other", "manual");
    await manual.server.stop();
    expect(await readSelection({ ...options, ideId: ideLockId(manual.lock) })).toBeUndefined();
  });

  it("retains responsive IDEs when another candidate exhausts the list deadline", async () => {
    const options = await setup();
    const local = await addIde(options.lockDir, options.cwd, "local secret");
    const stalled = createServer((socket) => stalledSockets.add(socket));
    stalledServers.push(stalled);
    await new Promise<void>((resolve) => stalled.listen(0, "127.0.0.1", resolve));
    const address = stalled.address();
    if (!address || typeof address === "string") throw new Error("stalled server did not bind");
    await writeLock(
      join(options.lockDir, "stalled.lock"),
      createLock(address.port, "b".repeat(64), ["/other"]),
    );
    const available = await listAvailableIde({ ...options, timeoutMs: LIST_TIMEOUT_MS });
    expect(available.map((ide) => ide.id)).toEqual([ideLockId(local.lock)]);
  });

  it("does not probe IDEs when listing is cancelled", async () => {
    const options = await setup();
    await addIde(options.lockDir, options.cwd, "local secret");
    expect(await listAvailableIde({ ...options, signal: AbortSignal.abort() })).toEqual([]);
  });
});
