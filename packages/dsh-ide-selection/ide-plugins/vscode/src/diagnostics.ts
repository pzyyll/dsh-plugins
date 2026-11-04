// ABOUTME: Offers explicit VS Code quick fixes that forward bounded diagnostics to DSH.
// ABOUTME: Adapted from pi-x-ide diagnostics.ts under Apache-2.0; only send-diagnostic behavior is retained.
import * as vscode from "vscode";
import {
  MAX_DIAGNOSTIC_CONTEXT_LINES,
  MAX_DIAGNOSTIC_LINE_CHARS,
  MAX_DIAGNOSTIC_MESSAGE_CHARS,
  MAX_DIAGNOSTIC_METADATA_CHARS,
  MAX_DIAGNOSTIC_PAYLOAD_CHARS,
  MAX_DIAGNOSTIC_SELECTED_CHARS,
  MAX_DIAGNOSTICS,
  parseDiagnosticContext,
} from "../../../src/shared/diagnostics.js";
import type { DiagnosticContext, IdeDiagnostic, Position } from "../../../src/shared/protocol.js";
import type { IdeServer } from "../../../src/shared/server.js";

export const SEND_DIAGNOSTIC_COMMAND = "dsh-ide-selection.sendDiagnostic";
export const SEND_DIAGNOSTIC_TITLE = "DSH: Send diagnostic";
const DIAGNOSTIC_CONTEXT_RADIUS = 2;
const DIAGNOSTIC_STATUS_DURATION_MS = 2_500;
const TRUNCATED = "\n...[truncated]";

export function registerDiagnosticQuickFixes(
  context: vscode.ExtensionContext,
  getServer: () => IdeServer | undefined,
): void {
  const provider = new DiagnosticCodeActionProvider(getServer);
  context.subscriptions.push(
    vscode.languages.registerCodeActionsProvider({ scheme: "file" }, provider, {
      providedCodeActionKinds: [vscode.CodeActionKind.QuickFix],
    }),
    vscode.commands.registerCommand(SEND_DIAGNOSTIC_COMMAND, (payload: DiagnosticContext) => {
      const server = getServer();
      if (!server || !server.sendDiagnostics(payload)) {
        void vscode.window.showWarningMessage(
          "DSH could not forward the diagnostic: no matching composer is connected.",
        );
        return;
      }
      vscode.window.setStatusBarMessage(
        "DSH forwarded diagnostic to the composer",
        DIAGNOSTIC_STATUS_DURATION_MS,
      );
    }),
  );
}

export class DiagnosticCodeActionProvider implements vscode.CodeActionProvider<vscode.CodeAction> {
  constructor(private readonly getServer: () => IdeServer | undefined) {}

  provideCodeActions(
    document: vscode.TextDocument,
    _range: vscode.Range | vscode.Selection,
    context: vscode.CodeActionContext,
  ): vscode.CodeAction[] {
    if (context.only && !context.only.contains(vscode.CodeActionKind.QuickFix)) return [];
    if (!vscode.workspace.isTrusted || document.uri.scheme !== "file") return [];
    if ((this.getServer()?.diagnosticClientCount ?? 0) < 1) return [];

    const diagnostics = context.diagnostics.filter(isSendableDiagnostic).slice(0, MAX_DIAGNOSTICS);
    if (diagnostics.length === 0) return [];
    const payload = createDiagnosticContext(document, diagnostics);
    if (!payload) return [];

    const action = new vscode.CodeAction(SEND_DIAGNOSTIC_TITLE, vscode.CodeActionKind.QuickFix);
    action.diagnostics = diagnostics;
    action.command = {
      command: SEND_DIAGNOSTIC_COMMAND,
      title: SEND_DIAGNOSTIC_TITLE,
      arguments: [payload],
    };
    return [action];
  }
}

function isSendableDiagnostic(diagnostic: vscode.Diagnostic): boolean {
  return (
    diagnostic.severity === vscode.DiagnosticSeverity.Error ||
    diagnostic.severity === vscode.DiagnosticSeverity.Warning
  );
}

export function createDiagnosticContext(
  document: vscode.TextDocument,
  diagnostics: readonly vscode.Diagnostic[],
): DiagnosticContext | undefined {
  if (document.uri.scheme !== "file" || diagnostics.length === 0) return undefined;
  const folder = vscode.workspace.getWorkspaceFolder(document.uri)?.uri.fsPath;
  const base = {
    source: "vscode" as const,
    filePath: document.uri.fsPath,
    ...(folder === undefined ? {} : { workspaceFolder: folder }),
    documentVersion: document.version,
    diagnostics: [] as IdeDiagnostic[],
  };

  for (const item of diagnostics.slice(0, MAX_DIAGNOSTICS)) {
    const normalized = normalizeDiagnostic(document, item);
    const candidate = { ...base, diagnostics: [...base.diagnostics, normalized] };
    if (JSON.stringify(candidate).length > MAX_DIAGNOSTIC_PAYLOAD_CHARS) break;
    base.diagnostics.push(normalized);
  }
  return base.diagnostics.length > 0 ? parseDiagnosticContext(base) : undefined;
}

function normalizeDiagnostic(
  document: vscode.TextDocument,
  diagnostic: vscode.Diagnostic,
): IdeDiagnostic {
  return {
    severity: diagnostic.severity === vscode.DiagnosticSeverity.Error ? "error" : "warning",
    message: truncate(diagnostic.message, MAX_DIAGNOSTIC_MESSAGE_CHARS),
    ...(typeof diagnostic.source === "string"
      ? { source: diagnostic.source.slice(0, MAX_DIAGNOSTIC_METADATA_CHARS) }
      : {}),
    ...(typeof diagnostic.code === "string"
      ? { code: diagnostic.code.slice(0, MAX_DIAGNOSTIC_METADATA_CHARS) }
      : typeof diagnostic.code === "number"
        ? { code: diagnostic.code }
        : diagnostic.code && typeof diagnostic.code === "object"
          ? { code: normalizeDiagnosticCode(diagnostic.code.value) }
          : {}),
    range: toProtocolRange(diagnostic.range),
    selectedText: truncate(
      readSelectedText(document, diagnostic.range),
      MAX_DIAGNOSTIC_SELECTED_CHARS,
    ),
    contextLines: getContextLines(document, diagnostic.range),
  };
}

function normalizeDiagnosticCode(code: unknown): string | number | undefined {
  if (typeof code === "number") return code;
  return typeof code === "string" ? code.slice(0, MAX_DIAGNOSTIC_METADATA_CHARS) : undefined;
}

function readSelectedText(document: vscode.TextDocument, range: vscode.Range): string {
  const startOffset = document.offsetAt(range.start);
  const endOffset = document.offsetAt(range.end);
  const boundedEnd = Math.min(endOffset, startOffset + MAX_DIAGNOSTIC_SELECTED_CHARS + 1);
  const boundedRange = new vscode.Range(range.start, document.positionAt(boundedEnd));
  return document.getText(boundedRange);
}

function truncate(text: string, limit: number): string {
  if (text.length <= limit) return text;
  return `${text.slice(0, Math.max(0, limit - TRUNCATED.length))}${TRUNCATED}`;
}

function getContextLines(document: vscode.TextDocument, range: vscode.Range) {
  const lastLine = Math.max(0, document.lineCount - 1);
  const start = Math.max(0, range.start.line - DIAGNOSTIC_CONTEXT_RADIUS);
  const end = Math.min(lastLine, range.end.line + DIAGNOSTIC_CONTEXT_RADIUS);
  const total = end - start + 1;
  const count = Math.min(MAX_DIAGNOSTIC_CONTEXT_LINES, total);
  const lines = new Set<number>();
  // Bound iteration and retain context from both ends of huge multiline ranges.
  const firstCount = total > count ? Math.ceil(count / 2) : count;
  for (let offset = 0; offset < firstCount; offset += 1) lines.add(start + offset);
  for (let offset = 0; lines.size < count; offset += 1) lines.add(end - offset);
  return [...lines]
    .sort((a, b) => a - b)
    .map((line) => ({
      line,
      text: truncate(document.lineAt(line).text, MAX_DIAGNOSTIC_LINE_CHARS),
    }));
}

function toProtocolRange(range: vscode.Range): { start: Position; end: Position } {
  return {
    start: { line: range.start.line, character: range.start.character },
    end: { line: range.end.line, character: range.end.character },
  };
}
