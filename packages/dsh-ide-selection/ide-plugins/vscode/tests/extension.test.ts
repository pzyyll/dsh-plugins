// ABOUTME: Exercises the VS Code extension lifecycle against the real server and lock writer.
// ABOUTME: Uses real server and lock I/O with mocked VS Code APIs and a gated lock write.
import { mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { state } = vi.hoisted(() => {
  const state = {
    lockDir: "",
    trusted: true,
    workspaceFolders: [] as Array<{ uri: { fsPath: string } }>,
    listeners: [] as Array<(...args: unknown[]) => void>,
    outputLines: [] as string[],
    warningMessages: [] as string[],
    blockNextWrite: false,
    failNextWrite: false,
    writeStarted: undefined as (() => void) | undefined,
    releaseWrite: undefined as (() => void) | undefined,
  };
  return { state };
});

vi.mock("../../../src/shared/lock.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../src/shared/lock.js")>();
  return {
    ...actual,
    writeLock: async (...args: Parameters<typeof actual.writeLock>) => {
      if (state.failNextWrite) {
        state.failNextWrite = false;
        throw new Error("simulated lock write failure");
      }
      if (state.blockNextWrite) {
        state.blockNextWrite = false;
        state.writeStarted?.();
        await new Promise<void>((resolve) => {
          state.releaseWrite = resolve;
        });
      }
      await actual.writeLock(...args);
    },
  };
});

vi.mock("vscode", () => {
  const register = (listener: (...args: unknown[]) => void) => {
    state.listeners.push(listener);
    return { dispose: vi.fn() };
  };
  return {
    window: {
      createOutputChannel: vi.fn(() => ({
        appendLine: (line: string) => state.outputLines.push(line),
        show: vi.fn(),
        dispose: vi.fn(),
      })),
      showWarningMessage: vi.fn((message: string) => {
        state.warningMessages.push(message);
      }),
      setStatusBarMessage: vi.fn(),
      createStatusBarItem: vi.fn(() => ({ show: vi.fn(), dispose: vi.fn() })),
      onDidChangeActiveTextEditor: register,
      onDidChangeTextEditorSelection: register,
      tabGroups: { onDidChangeTabs: register },
    },
    languages: {
      registerCodeActionsProvider: vi.fn(() => ({ dispose: vi.fn() })),
    },
    commands: {
      registerCommand: vi.fn(() => ({ dispose: vi.fn() })),
    },
    StatusBarAlignment: { Right: 2 },
    CodeActionKind: { QuickFix: "quickfix" },
    DiagnosticSeverity: { Error: 0, Warning: 1 },
    workspace: {
      get isTrusted() {
        return state.trusted;
      },
      get workspaceFolders() {
        return state.workspaceFolders;
      },
      getConfiguration: vi.fn(() => ({ get: () => state.lockDir })),
      onDidChangeTextDocument: register,
      onDidChangeWorkspaceFolders: register,
      getWorkspaceFolder: vi.fn(),
    },
  };
});

import type * as vscode from "vscode";
import { IdeServer } from "../../../src/shared/server.js";
import { activate, deactivate } from "../src/extension.js";

let tempRoot: string;
let lockDir: string;

beforeEach(async () => {
  tempRoot = await mkdtemp(join(tmpdir(), "dsh-vscode-extension-"));
  lockDir = join(tempRoot, "locks");
  state.lockDir = lockDir;
  state.trusted = true;
  state.workspaceFolders = [{ uri: { fsPath: join(lockDir, "workspace") } }];
  state.listeners = [];
  state.outputLines = [];
  state.warningMessages = [];
  state.blockNextWrite = false;
  state.failNextWrite = false;
  state.writeStarted = undefined;
  state.releaseWrite = undefined;
});

afterEach(async () => {
  await deactivate();
  await rm(tempRoot, { recursive: true, force: true });
});

describe("VS Code extension lifecycle", () => {
  it("skips server and lock startup when workspace trust is unavailable", async () => {
    state.trusted = false;
    const context = { subscriptions: [] as vscode.Disposable[] } as vscode.ExtensionContext;
    await activate(context);

    expect(await readdir(tempRoot)).toEqual([]);
    expect(state.outputLines.join("\n")).toContain("workspace trust is required");
  });

  it.each([
    { lockDir: "relative-lock-dir", reason: "relative paths" },
    { lockDir: `${process.cwd()}\0invalid`, reason: "null bytes" },
  ])(
    "rejects lockDir with $reason before starting the server or creating a lock",
    async ({ lockDir: configuredLockDir }) => {
      state.lockDir = configuredLockDir;
      const context = { subscriptions: [] as vscode.Disposable[] } as vscode.ExtensionContext;
      const startSpy = vi.spyOn(IdeServer.prototype, "start");

      try {
        await expect(activate(context)).resolves.toBeUndefined();
        expect(startSpy).not.toHaveBeenCalled();
        expect(state.warningMessages.join("\n")).toContain(
          "dshIdeSelection.lockDir must be an absolute path",
        );
        expect(state.listeners).toEqual([]);
        expect(await readdir(tempRoot)).toEqual([]);
      } finally {
        startSpy.mockRestore();
      }
    },
  );

  it("contains startup lock-write failures and closes the already-started server", async () => {
    state.failNextWrite = true;
    const context = { subscriptions: [] as vscode.Disposable[] } as vscode.ExtensionContext;

    await expect(activate(context)).resolves.toBeUndefined();
    expect(state.warningMessages.join("\n")).toContain(
      "activation failed: simulated lock write failure",
    );
    expect(await readdir(tempRoot)).toEqual([]);
    await deactivate();
  });

  it("starts the real loopback server, refreshes the lock, then drains and removes it", async () => {
    const context = { subscriptions: [] as vscode.Disposable[] } as vscode.ExtensionContext;
    await activate(context);

    const lockFiles = await readdir(lockDir);
    expect(lockFiles).toHaveLength(1);
    expect(lockFiles[0]).toMatch(/^vscode-\d+-\d+\.lock$/);
    const path = join(lockDir, lockFiles[0]!);
    const initial = JSON.parse(await readFile(path, "utf8")) as {
      port: number;
      authToken: string;
      workspaceFolders: string[];
      updatedAt: string;
    };
    expect(initial.port).toBeGreaterThan(0);
    expect(initial.authToken).toMatch(/^[\da-f]{64}$/);
    expect(initial.workspaceFolders).toEqual([join(lockDir, "workspace")]);
    if (process.platform !== "win32") {
      expect((await stat(lockDir)).mode & 0o777).toBe(0o700);
      expect((await stat(path)).mode & 0o777).toBe(0o600);
    }
    expect(state.listeners).toHaveLength(5);

    const updatedWorkspace = join(lockDir, "updated-workspace");
    state.workspaceFolders = [{ uri: { fsPath: updatedWorkspace } }];
    state.listeners[4]!();
    await vi.waitFor(async () => {
      const updated = JSON.parse(await readFile(path, "utf8")) as typeof initial;
      expect(updated.workspaceFolders).toEqual([updatedWorkspace]);
      expect(Date.parse(updated.updatedAt)).toBeGreaterThanOrEqual(Date.parse(initial.updatedAt));
    });

    state.blockNextWrite = true;
    const writeStarted = new Promise<void>((resolve) => {
      state.writeStarted = resolve;
    });
    state.listeners[4]!();
    await writeStarted;

    let cleanupFinished = false;
    const cleanup = deactivate().then(() => {
      cleanupFinished = true;
    });
    await Promise.resolve();
    const waitedForRefresh = !cleanupFinished;
    state.releaseWrite?.();
    await cleanup;
    expect(waitedForRefresh).toBe(true);
    expect(await readdir(lockDir)).toEqual([]);
  });
});
