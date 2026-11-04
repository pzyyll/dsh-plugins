// ABOUTME: Show the VS Code bridge connection count and editor state in the status bar.
// ABOUTME: Adapt pi-x-ide's status item with output access and deterministic subscription cleanup.
import * as vscode from "vscode";
import { PROTOCOL_VERSION, type EditorSelectionSnapshot } from "../../../src/shared/protocol.js";
import type { IdeConnectionStatus, IdeServer } from "../../../src/shared/server.js";

export const SHOW_CONNECTION_STATUS_COMMAND = "dsh-ide-selection.showConnectionStatus";
const STATUS_PRIORITY = 100;

type EditorState = "none" | "file" | "selection";

/** One per-window status item; connection changes update it without an editor gesture. */
export class IdeStatusBar implements vscode.Disposable {
  private readonly item: vscode.StatusBarItem;
  private readonly command: vscode.Disposable;
  private readonly unsubscribe: () => void;
  private current: IdeConnectionStatus = { clientCount: 0 };
  private editor: EditorState = "none";
  private lastSummary: string | undefined;
  private disposed = false;

  constructor(
    private readonly server: IdeServer,
    private readonly output: vscode.OutputChannel,
  ) {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, STATUS_PRIORITY);
    this.item.name = "DSH IDE Selection";
    this.item.command = SHOW_CONNECTION_STATUS_COMMAND;
    this.command = vscode.commands.registerCommand(SHOW_CONNECTION_STATUS_COMMAND, () => {
      this.output.appendLine(this.summary());
      this.output.show(true);
    });
    this.unsubscribe = server.subscribeConnections((status) => {
      this.current = status;
      this.render();
    });
  }

  updateSelection(snapshot: EditorSelectionSnapshot | undefined): void {
    this.editor = snapshot ? (snapshot.ranges.length > 0 ? "selection" : "file") : "none";
    this.render();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.unsubscribe();
    this.command.dispose();
    this.item.dispose();
  }

  private summary(): string {
    const { clientCount } = this.current;
    const connection =
      clientCount === 0
        ? "No dsh clients connected. Open a matching dsh session."
        : "DSH is connected.";
    return [
      `DSH IDE Selection (protocol v${PROTOCOL_VERSION}) on 127.0.0.1:${this.server.port}`,
      `Bridge clients: ${clientCount}.`,
      connection,
      "Quick Fix requires an Error or Warning diagnostic at the cursor; a selection alone is not enough.",
      "Click to show the DSH IDE Selection output.",
    ].join("\n");
  }

  private render(): void {
    if (this.disposed) return;
    const suffix = this.current.clientCount === 0 ? "waiting" : "connected";
    const icon =
      this.editor === "selection"
        ? "$(symbol-string)"
        : this.editor === "file"
          ? "$(file-code)"
          : "$(plug)";
    this.item.text = `${icon} DSH: ${suffix}`;
    const summary = this.summary();
    this.item.tooltip = summary;
    this.item.show();
    if (summary !== this.lastSummary) {
      this.lastSummary = summary;
      this.output.appendLine(summary);
    }
  }
}
