// ABOUTME: Adds an explicit editor-selection action that inserts a reference into DSH Chat.
// ABOUTME: Adapts pi-x-ide's attachment command without submitting the user's draft.
import * as vscode from "vscode";
import { formatRangeMention } from "../../../src/shared/format.js";
import type { IdeServer } from "../../../src/shared/server.js";
import { getActiveSelectionSnapshot } from "./selection.js";

export const ADD_TO_CHAT_COMMAND = "dsh-ide-selection.addToChat";
const STATUS_DURATION_MS = 2_500;

export function registerAddToChat(
  context: vscode.ExtensionContext,
  getServer: () => IdeServer | undefined,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(ADD_TO_CHAT_COMMAND, () => {
      if (!vscode.workspace.isTrusted) return;
      try {
        const snapshot =
          vscode.window.activeTextEditor?.document.uri.scheme === "file"
            ? getActiveSelectionSnapshot()
            : undefined;
        if (!snapshot) {
          void vscode.window.showWarningMessage("DSH: open a local file to add to chat.");
          return;
        }
        if (!getServer()?.attach(snapshot)) {
          void vscode.window.showWarningMessage(
            "DSH could not forward the selection: no client is connected. Open a matching dsh composer.",
          );
          return;
        }
        vscode.window.setStatusBarMessage(
          `DSH added ${formatRangeMention(snapshot)} to chat`,
          STATUS_DURATION_MS,
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        void vscode.window.showWarningMessage(`DSH could not forward the selection: ${message}`);
      }
    }),
  );
}
