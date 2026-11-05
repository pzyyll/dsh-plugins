// ABOUTME: Runs the trusted-workspace VS Code bridge and publishes editor selection changes.
// ABOUTME: Owns the DSH lock heartbeat and deterministic extension lifecycle cleanup.
// Adapted from pi-x-ide/ide-plugins/vscode/src/extension.ts under Apache-2.0; selection and diagnostic quick fixes enabled.
import { randomBytes } from "node:crypto";
import { rm } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import * as vscode from "vscode";
import { createLock, defaultLockDir, writeLock } from "../../../src/shared/lock.js";
import type { IdeLockFile } from "../../../src/shared/protocol.js";
import { IdeServer } from "../../../src/shared/server.js";
import { getActiveSelectionSnapshot } from "./selection.js";
import { registerDiagnosticQuickFixes } from "./diagnostics.js";
import { IdeStatusBar } from "./status.js";
import { registerAddToChat } from "./chat.js";

const AUTH_TOKEN_BYTES = 32;
const HEARTBEAT_INTERVAL_MS = 60_000;
const BROADCAST_DEBOUNCE_MS = 100;

let server: IdeServer | undefined;
let lockFilePath: string | undefined;
let lockFile: IdeLockFile | undefined;
let output: vscode.OutputChannel | undefined;
let status: IdeStatusBar | undefined;
let heartbeatTimer: ReturnType<typeof setInterval> | undefined;
let heartbeatChain: Promise<void> = Promise.resolve();
let broadcastTimer: ReturnType<typeof setTimeout> | undefined;
let cleanupPromise: Promise<void> | undefined;
let stopping = false;

function reportError(scope: string, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  try {
    output?.appendLine(`[${new Date().toISOString()}] ${scope}: ${message}`);
  } catch {
    // Reporting must not prevent failed startup or cleanup from completing.
  }
  try {
    void Promise.resolve(
      vscode.window.showWarningMessage(`DSH IDE Selection: ${scope} failed: ${message}`),
    ).catch(() => undefined);
  } catch {
    // The extension host may already be shutting down.
  }
}

function queueHeartbeat(): void {
  heartbeatChain = heartbeatChain
    .then(async () => {
      if (stopping || !lockFilePath || !lockFile) return;
      const nextLock: IdeLockFile = {
        ...lockFile,
        workspaceFolders: (vscode.workspace.workspaceFolders ?? []).map(
          (folder) => folder.uri.fsPath,
        ),
        updatedAt: new Date().toISOString(),
      };
      await writeLock(lockFilePath, nextLock);
      lockFile = nextLock;
    })
    .catch((error: unknown) => reportError("lock heartbeat", error));
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  output = vscode.window.createOutputChannel("DSH IDE Selection");
  context.subscriptions.push(output);
  cleanupPromise = undefined;
  stopping = false;

  if (!vscode.workspace.isTrusted) {
    output.appendLine("Activation skipped: workspace trust is required.");
    return;
  }

  try {
    const configuredLockDir = vscode.workspace
      .getConfiguration("dshIdeSelection")
      .get<string>("lockDir");
    if (configuredLockDir && (!isAbsolute(configuredLockDir) || configuredLockDir.includes("\0"))) {
      throw new Error("dshIdeSelection.lockDir must be an absolute path without null bytes.");
    }

    const authToken = randomBytes(AUTH_TOKEN_BYTES).toString("hex");
    const ideServer = new IdeServer(authToken, getActiveSelectionSnapshot);
    server = ideServer;
    const port = await ideServer.start();
    const lockDir = configuredLockDir || defaultLockDir();
    const path = join(lockDir, `vscode-${process.pid}-${port}.lock`);
    const workspaceFolders = (vscode.workspace.workspaceFolders ?? []).map(
      (folder) => folder.uri.fsPath,
    );
    const initialLock = createLock(port, authToken, workspaceFolders);

    lockFilePath = path;
    lockFile = initialLock;
    await writeLock(path, initialLock);
    heartbeatTimer = setInterval(queueHeartbeat, HEARTBEAT_INTERVAL_MS);

    status = new IdeStatusBar(ideServer, output);
    context.subscriptions.push(status);
    registerDiagnosticQuickFixes(context, () => server);
    registerAddToChat(context, () => server);
    context.subscriptions.push(
      vscode.window.onDidChangeActiveTextEditor(scheduleSelectionBroadcast),
      vscode.window.onDidChangeTextEditorSelection(scheduleSelectionBroadcast),
      vscode.workspace.onDidChangeTextDocument(scheduleSelectionBroadcast),
      vscode.window.tabGroups.onDidChangeTabs(scheduleSelectionBroadcast),
      vscode.workspace.onDidChangeWorkspaceFolders(() => {
        queueHeartbeat();
        scheduleSelectionBroadcast();
      }),
      { dispose: () => void cleanup() },
    );
    scheduleSelectionBroadcast();
  } catch (error) {
    reportError("activation", error);
    await cleanup();
  }
}

export async function deactivate(): Promise<void> {
  await cleanup();
}

function scheduleSelectionBroadcast(): void {
  if (broadcastTimer) clearTimeout(broadcastTimer);
  broadcastTimer = setTimeout(() => {
    broadcastTimer = undefined;
    if (!server) return;
    try {
      const snapshot = getActiveSelectionSnapshot();
      server.broadcast(snapshot);
      status?.updateSelection(snapshot);
    } catch (error) {
      reportError("selection broadcast", error);
    }
  }, BROADCAST_DEBOUNCE_MS);
}

function cleanup(): Promise<void> {
  if (cleanupPromise) return cleanupPromise;
  stopping = true;
  cleanupPromise = (async () => {
    if (broadcastTimer) clearTimeout(broadcastTimer);
    broadcastTimer = undefined;
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    heartbeatTimer = undefined;
    await heartbeatChain;
    status?.dispose();
    status = undefined;

    const path = lockFilePath;
    lockFilePath = undefined;
    lockFile = undefined;
    if (path) {
      try {
        await rm(path, { force: true });
      } catch (error) {
        reportError("lock removal", error);
      }
    }

    const activeServer = server;
    server = undefined;
    if (activeServer) {
      try {
        await activeServer.stop();
      } catch (error) {
        reportError("server shutdown", error);
      }
    }
  })();
  return cleanupPromise;
}
