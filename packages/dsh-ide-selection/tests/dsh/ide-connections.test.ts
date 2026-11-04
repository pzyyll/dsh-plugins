// ABOUTME: Verify session-local IDE choices share live sockets for status, diagnostics, reads, and pickers.
// ABOUTME: Broadcast real editor updates and reject stale, outside-workspace, or cancelled choices.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SessionId } from "@deepseek-ai/dsh-session";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ideLockId } from "../../src/shared/ide.js";
import { createLock, writeLock } from "../../src/shared/lock.js";
import type { DiagnosticContext, EditorSelectionSnapshot } from "../../src/shared/protocol.js";
import type { FollowUpdate } from "../../src/shared/watch.js";
import { IdeServer } from "../../src/shared/server.js";
import { IdeConnections } from "../../src/dsh/ide-connections.js";

const SESSION_ONE = SessionId("picker-session-one");
const SESSION_TWO = SessionId("picker-session-two");
const TIMEOUT_MS = 1_000;
const MAX_AGE_MS = 60_000;
const AUTH_TOKEN = "a".repeat(64);
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
  return { connections, lockDir, signal: lifetime.signal, lifetime };
}

async function addIde(lockDir: string, workspace: string) {
  let text = "first snapshot";
  const snapshot = (): EditorSelectionSnapshot => ({
    source: "vscode",
    filePath: `${workspace}/selected.ts`,
    workspaceFolder: workspace,
    ranges: [
      { text, selection: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } } },
    ],
  });
  let selectionReads = 0;
  const server = new IdeServer(AUTH_TOKEN, () => {
    selectionReads += 1;
    return snapshot();
  });
  servers.push(server);
  const port = await server.start();
  const lock = createLock(port, AUTH_TOKEN, [workspace]);
  await writeLock(join(lockDir, `vscode-${port}.lock`), lock);
  return {
    id: ideLockId(lock),
    server,
    setText(value: string) {
      text = value;
      server.broadcast(snapshot());
    },
    snapshot,
    selectionReads: () => selectionReads,
  };
}

describe("session IDE choices", () => {
  it("pools status, diagnostic receivers, reads, and picker probes until the final consumer leaves", async () => {
    const { connections, lockDir, signal, lifetime } = await setup();
    const ide = await addIde(lockDir, "/work/app");
    const updates: FollowUpdate[] = [];
    const firstActions: DiagnosticContext[] = [];
    const duplicateActions: DiagnosticContext[] = [];
    const secondActions: DiagnosticContext[] = [];
    const stopStatus = connections.watch(SESSION_ONE, "/work/app", (update) =>
      updates.push(update),
    );
    const stopFirst = connections.watch(
      SESSION_ONE,
      "/work/app",
      () => undefined,
      (action) => firstActions.push(action),
    );
    const stopDuplicate = connections.watch(
      SESSION_ONE,
      "/work/app",
      () => undefined,
      (action) => duplicateActions.push(action),
    );
    const stopSecond = connections.watch(
      SESSION_TWO,
      "/work/app",
      () => undefined,
      (action) => secondActions.push(action),
    );
    await vi.waitFor(() => expect(updates.at(-1)?.type).toBe("selection"));
    expect(ide.server.clientCount).toBe(1);
    const initialSelectionReads = ide.selectionReads();
    expect(await connections.read(SESSION_ONE, "/work/app", signal)).toMatchObject(ide.snapshot());
    expect(await connections.listTargets("/work/app", signal)).toMatchObject({
      automaticId: ide.id,
    });
    expect(ide.server.clientCount).toBe(1);

    ide.setText("live shared snapshot");
    await vi.waitFor(() =>
      expect(updates.at(-1)).toMatchObject({
        type: "selection",
        snapshot: { ranges: [{ text: "live shared snapshot" }] },
      }),
    );
    expect(await connections.read(SESSION_TWO, "/work/app", signal)).toMatchObject(ide.snapshot());
    expect(ide.server.clientCount).toBe(1);
    expect(ide.selectionReads()).toBe(initialSelectionReads);
    const diagnostic: DiagnosticContext = {
      source: "vscode",
      filePath: "/work/app/selected.ts",
      workspaceFolder: "/work/app",
      documentVersion: 1,
      action: "fix",
      diagnostics: [
        {
          severity: "warning",
          message: "Fix this shared diagnostic.",
          range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
          selectedText: "x",
          contextLines: [{ line: 0, text: "x" }],
        },
      ],
    };
    expect(ide.server.sendDiagnostics(diagnostic)).toBe(true);
    await vi.waitFor(() => expect(firstActions).toEqual([diagnostic]));
    expect(duplicateActions).toEqual([]);
    expect(secondActions).toEqual([]);
    stopStatus();
    stopFirst();
    stopDuplicate();
    connections.forget(SESSION_ONE);
    expect(ide.server.clientCount).toBe(1);
    expect(ide.server.sendDiagnostics({ ...diagnostic, action: "send-diagnostic" })).toBe(true);
    await vi.waitFor(() =>
      expect(secondActions).toEqual([{ ...diagnostic, action: "send-diagnostic" }]),
    );
    stopSecond();
    connections.forget(SESSION_TWO);
    await vi.waitFor(() => expect(ide.server.clientCount).toBe(0));
    lifetime.abort();
  });

  it("routes actions by composer subscription order rather than earlier headless reads", async () => {
    const { connections, lockDir, signal } = await setup();
    const workspace = "/work/app";
    const ide = await addIde(lockDir, workspace);
    // Session A's retained live record predates either diagnostic receiver.
    expect(await connections.read(SESSION_ONE, workspace, signal)).toMatchObject(ide.snapshot());
    const composerA: DiagnosticContext[] = [];
    const composerB: DiagnosticContext[] = [];
    const updatesB: FollowUpdate[] = [];
    const stopB = connections.watch(
      SESSION_TWO,
      workspace,
      (update) => updatesB.push(update),
      (context) => composerB.push(context),
    );
    const stopA = connections.watch(
      SESSION_ONE,
      workspace,
      () => undefined,
      (context) => composerA.push(context),
    );
    await vi.waitFor(() => expect(updatesB.at(-1)?.type).toBe("selection"));
    expect(ide.server.clientCount).toBe(1);
    const firstAction: DiagnosticContext = {
      source: "vscode",
      filePath: `${workspace}/selected.ts`,
      workspaceFolder: workspace,
      documentVersion: 1,
      action: "fix",
      diagnostics: [
        {
          severity: "warning",
          message: "First composer action.",
          range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
          selectedText: "x",
          contextLines: [{ line: 0, text: "x" }],
        },
      ],
    };
    expect(ide.server.sendDiagnostics(firstAction)).toBe(true);
    await vi.waitFor(() => expect(composerB).toEqual([firstAction]));
    expect(composerA).toEqual([]);

    stopB();
    expect(ide.server.clientCount).toBe(1);
    const nextAction: DiagnosticContext = {
      ...firstAction,
      action: "send-diagnostic",
      documentVersion: 2,
    };
    expect(ide.server.sendDiagnostics(nextAction)).toBe(true);
    await vi.waitFor(() => expect(composerA).toEqual([nextAction]));
    expect(composerB).toEqual([firstAction]);
    stopA();
    connections.forget(SESSION_ONE);
    connections.forget(SESSION_TWO);
    await vi.waitFor(() => expect(ide.server.clientCount).toBe(0));
  });

  it("keeps a manual target local to its session and reads fresh snapshots", async () => {
    const { connections, lockDir, signal } = await setup();
    const local = await addIde(lockDir, "/work/app");
    const manual = await addIde(lockDir, "/work/app/other");
    expect(await connections.select(SESSION_ONE, manual.id, "/work/app", signal)).toMatchObject({
      id: manual.id,
    });
    expect(connections.getTarget(SESSION_ONE)).toEqual({ kind: "manual", ideId: manual.id });
    expect(connections.getTarget(SESSION_TWO)).toEqual({ kind: "auto" });
    expect((await connections.read(SESSION_ONE, "/work/app", signal))?.filePath).toBe(
      "/work/app/other/selected.ts",
    );
    expect((await connections.read(SESSION_TWO, "/work/app", signal))?.filePath).toBe(
      "/work/app/selected.ts",
    );
    manual.setText("changed snapshot");
    await vi.waitFor(async () =>
      expect((await connections.read(SESSION_ONE, "/work/app", signal))?.ranges[0]?.text).toBe(
        "changed snapshot",
      ),
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
    const manual = await addIde(lockDir, "/work/app/other");
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

  it("rejects mismatching targets and a manual child that becomes outside after cwd changes", async () => {
    const { connections, lockDir, signal } = await setup();
    const local = await addIde(lockDir, "/work/app");
    const child = await addIde(lockDir, "/work/app/other");
    const unrelated = await addIde(lockDir, "/other/project");

    const listed = await connections.listTargets("/work/app", signal);
    expect(listed.ides).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: child.id, workspaceMatched: true }),
        expect.objectContaining({ id: unrelated.id, workspaceMatched: false }),
      ]),
    );
    await expect(
      connections.select(SESSION_ONE, child.id, "/work/app", signal),
    ).resolves.toMatchObject({
      id: child.id,
      workspaceMatched: true,
    });
    expect(
      await connections.select(SESSION_ONE, unrelated.id, "/work/app", signal),
    ).toBeUndefined();
    expect(connections.getTarget(SESSION_ONE)).toEqual({ kind: "manual", ideId: child.id });

    expect(await connections.read(SESSION_ONE, "/work/app/other/deeper", signal)).toBeUndefined();
    expect(
      await connections.select(SESSION_ONE, child.id, "/work/app/other/deeper", signal),
    ).toBeUndefined();
    expect(connections.getTarget(SESSION_ONE)).toEqual({ kind: "manual", ideId: child.id });
    expect(local.id).not.toBe(child.id);
  });

  it("publishes target changes and forgets disposed session choices", async () => {
    const { connections, lockDir, signal } = await setup();
    const manual = await addIde(lockDir, "/work/app/other");
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
