// ABOUTME: Verify the live IDE connection publishes selection changes and disconnects.
// ABOUTME: Use the real selection server and a temporary lock file.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createLock, writeLock } from "./lock.js";
import { ideLockId } from "./ide.js";
import type { EditorSelectionSnapshot } from "./protocol.js";
import { IdeServer } from "./server.js";
import { followSelection, type FollowUpdate } from "./watch.js";

const roots: string[] = [];
const servers: IdeServer[] = [];
const controllers: AbortController[] = [];
const WATCH_RETRY_MS = 20;
const MISMATCH_OBSERVATION_MS = 250;
const ABORT_SETTLE_MS = 10;
afterEach(async () => {
  for (const controller of controllers.splice(0)) controller.abort();
  await Promise.all(servers.splice(0).map((server) => server.stop()));
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
  it("follows an explicit descendant IDE without leaking text", async () => {
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
      maxAgeMs: 60_000,
      ideId: ideLockId(manualLock),
      signal: controller.signal,
      onUpdate: (update) => updates.push(update),
    });
    await waitFor(() => updates.some((update) => update.type === "selection"));
    expect(updates.find((update) => update.type === "selection")).toMatchObject({
      snapshot: { filePath: manualSnapshot.filePath, ranges: [{ text: "" }] },
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
      maxAgeMs: 60_000,
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
      maxAgeMs: 60_000,
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
      snapshot: { filePath: selected.filePath, ranges: [{ text: "" }] },
    });

    server.broadcast(undefined);
    await waitFor(() => updates.filter((update) => update.type === "cleared").length >= 2);
    await server.stop();
    await waitFor(() => updates.at(-1)?.type === "disconnected");
  });
});

async function waitFor(ready: () => boolean): Promise<void> {
  const started = Date.now();
  while (!ready()) {
    if (Date.now() - started > 2_000) throw new Error("timed out waiting for IDE status");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
