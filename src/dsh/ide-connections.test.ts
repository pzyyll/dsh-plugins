// ABOUTME: Verify session-scoped IDE choices drive fresh selection reads and live status.
// ABOUTME: Use real authenticated IDE servers and reject stale or cancelled choices.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SessionId } from "@deepseek-ai/dsh-session";
import { afterEach, describe, expect, it } from "vitest";
import { ideLockId } from "../shared/ide.js";
import { createLock, writeLock } from "../shared/lock.js";
import type { EditorSelectionSnapshot } from "../shared/protocol.js";
import { IdeServer } from "../shared/server.js";
import { IdeConnections } from "./ide-connections.js";

const SESSION_ONE = SessionId("picker-session-one");
const SESSION_TWO = SessionId("picker-session-two");
const TIMEOUT_MS = 1_000;
const MAX_AGE_MS = 60_000;
const roots: string[] = [];
const controllers: AbortController[] = [];
const servers: IdeServer[] = [];
afterEach(async () => {
  for (const controller of controllers.splice(0)) controller.abort();
  await Promise.all(servers.splice(0).map((server) => server.stop()));
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function setup() {
  const lockDir = await mkdtemp(join(tmpdir(), "dsh-ide-choices-"));
  roots.push(lockDir);
  const lifetime = new AbortController();
  controllers.push(lifetime);
  const connections = new IdeConnections({
    lockDir,
    timeoutMs: TIMEOUT_MS,
    maxAgeMs: MAX_AGE_MS,
    signal: lifetime.signal,
  });
  return { connections, lockDir, signal: lifetime.signal };
}

async function addIde(lockDir: string, workspace: string) {
  let text = "first snapshot";
  const server = new IdeServer("a".repeat(64), (): EditorSelectionSnapshot => ({
    source: "vscode",
    filePath: `${workspace}/selected.ts`,
    workspaceFolder: workspace,
    ranges: [
      { text, selection: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } } },
    ],
  }));
  servers.push(server);
  const port = await server.start();
  const lock = createLock(port, "a".repeat(64), [workspace]);
  await writeLock(join(lockDir, `vscode-${port}.lock`), lock);
  return {
    id: ideLockId(lock),
    server,
    setText(value: string) {
      text = value;
    },
  };
}

describe("session IDE choices", () => {
  it("keeps a manual target local to its session and reads fresh snapshots", async () => {
    const { connections, lockDir, signal } = await setup();
    const local = await addIde(lockDir, "/work/app");
    const manual = await addIde(lockDir, "/other/project");
    expect(await connections.select(SESSION_ONE, manual.id, "/work/app", signal)).toMatchObject({
      id: manual.id,
    });
    expect(connections.getTarget(SESSION_ONE)).toEqual({ kind: "manual", ideId: manual.id });
    expect(connections.getTarget(SESSION_TWO)).toEqual({ kind: "auto" });
    expect((await connections.read(SESSION_ONE, "/work/app", signal))?.filePath).toBe(
      "/other/project/selected.ts",
    );
    expect((await connections.read(SESSION_TWO, "/work/app", signal))?.filePath).toBe(
      "/work/app/selected.ts",
    );
    manual.setText("changed snapshot");
    expect((await connections.read(SESSION_ONE, "/work/app", signal))?.ranges[0]?.text).toBe(
      "changed snapshot",
    );
    connections.setMode(SESSION_ONE, "off");
    expect(await connections.read(SESSION_ONE, "/work/app", signal)).toBeUndefined();
    connections.setMode(SESSION_ONE, "auto");
    expect((await connections.read(SESSION_ONE, "/work/app", signal))?.filePath).toBe(
      "/work/app/selected.ts",
    );
    expect(local.id).not.toBe(manual.id);
  });

  it("rejects unavailable, cancelled, and superseded selections without changing the current mode", async () => {
    const { connections, lockDir, signal } = await setup();
    const manual = await addIde(lockDir, "/other/project");
    connections.setMode(SESSION_ONE, "off");
    expect(
      await connections.select(SESSION_ONE, manual.id, "/work/app", AbortSignal.abort()),
    ).toBeUndefined();
    const pending = connections.select(SESSION_ONE, manual.id, "/work/app", signal);
    connections.setMode(SESSION_ONE, "off");
    expect(await pending).toBeUndefined();
    await manual.server.stop();
    expect(await connections.select(SESSION_ONE, manual.id, "/work/app", signal)).toBeUndefined();
    expect(connections.getTarget(SESSION_ONE)).toEqual({ kind: "off" });
  });

  it("publishes target changes and forgets disposed session choices", async () => {
    const { connections, lockDir, signal } = await setup();
    const manual = await addIde(lockDir, "/other/project");
    const targets: string[] = [];
    const stop = connections.subscribe(SESSION_ONE, (target) => targets.push(target.kind));
    await connections.select(SESSION_ONE, manual.id, "/work/app", signal);
    connections.forget(SESSION_ONE);
    expect(targets).toEqual(["auto", "manual", "auto"]);
    expect(connections.getTarget(SESSION_ONE)).toEqual({ kind: "auto" });
    stop();
    connections.setMode(SESSION_ONE, "off");
    expect(targets).toEqual(["auto", "manual", "auto"]);
  });
});
