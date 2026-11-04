// ABOUTME: Validate bounded diagnostic payloads and format explicit input context.
// ABOUTME: Keep diagnostic text separate from automatic selection snapshots and status events.
// Fix prompt adapted from pi-x-ide/src/pi/diagnostics.ts under Apache-2.0.
import type { DiagnosticContext, IdeDiagnostic, Position } from "./protocol.js";

export const MAX_DIAGNOSTIC_PAYLOAD_CHARS = 64_000;
export const MAX_DIAGNOSTICS = 10;
export const MAX_DIAGNOSTIC_MESSAGE_CHARS = 2_000;
export const MAX_DIAGNOSTIC_SELECTED_CHARS = 4_000;
export const MAX_DIAGNOSTIC_CONTEXT_LINES = 10;
export const MAX_DIAGNOSTIC_LINE_CHARS = 1_000;
export const MAX_DIAGNOSTIC_METADATA_CHARS = 1_000;
const MAX_PATH_CHARS = 16_000;
const DISPLAY_OFFSET = 1;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isText(value: unknown, limit: number): value is string {
  return typeof value === "string" && value.length <= limit;
}

function isPath(value: unknown): value is string {
  return isText(value, MAX_PATH_CHARS) && value.length > 0 && !value.includes("\0");
}

function isIndex(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isPosition(value: unknown): value is Position {
  return isRecord(value) && isIndex(value.line) && isIndex(value.character);
}

function isDiagnostic(value: unknown): value is IdeDiagnostic {
  if (
    !isRecord(value) ||
    (value.severity !== "error" && value.severity !== "warning") ||
    !isText(value.message, MAX_DIAGNOSTIC_MESSAGE_CHARS) ||
    (value.source !== undefined && !isText(value.source, MAX_DIAGNOSTIC_METADATA_CHARS)) ||
    (value.code !== undefined &&
      !isText(value.code, MAX_DIAGNOSTIC_METADATA_CHARS) &&
      !(typeof value.code === "number" && Number.isFinite(value.code))) ||
    !isRecord(value.range) ||
    !isPosition(value.range.start) ||
    !isPosition(value.range.end) ||
    !isText(value.selectedText, MAX_DIAGNOSTIC_SELECTED_CHARS) ||
    !Array.isArray(value.contextLines) ||
    value.contextLines.length > MAX_DIAGNOSTIC_CONTEXT_LINES
  )
    return false;
  const { start, end } = value.range;
  if (start.line > end.line || (start.line === end.line && start.character > end.character))
    return false;
  return value.contextLines.every(
    (line) => isRecord(line) && isIndex(line.line) && isText(line.text, MAX_DIAGNOSTIC_LINE_CHARS),
  );
}

/** Reject malformed and oversized wire data before it reaches a draft. */
export function parseDiagnosticContext(value: unknown): DiagnosticContext | undefined {
  if (
    !isRecord(value) ||
    value.source !== "vscode" ||
    (value.action !== undefined && value.action !== "send-diagnostic" && value.action !== "fix") ||
    !isPath(value.filePath) ||
    (value.workspaceFolder !== undefined && !isPath(value.workspaceFolder)) ||
    !isIndex(value.documentVersion) ||
    !Array.isArray(value.diagnostics) ||
    value.diagnostics.length === 0 ||
    value.diagnostics.length > MAX_DIAGNOSTICS ||
    !value.diagnostics.every(isDiagnostic) ||
    JSON.stringify(value).length > MAX_DIAGNOSTIC_PAYLOAD_CHARS
  )
    return undefined;
  return value as unknown as DiagnosticContext;
}

/** Build a separate repair prompt without including any composer draft text. */
export function formatDiagnosticFixPrompt(context: DiagnosticContext): string {
  return [
    "Analyze the errors and warnings at the following location, and try to fix them:",
    "",
    formatDiagnosticContext(context),
  ].join("\n");
}

/** Render only the explicitly requested diagnostics; never read files from disk. */
export function formatDiagnosticContext(context: DiagnosticContext): string {
  const lines = [
    "<ide-diagnostics>",
    `File: ${context.filePath}`,
    `Source: VS Code (document version ${context.documentVersion})`,
  ];
  for (const diagnostic of context.diagnostics) {
    const { start, end } = diagnostic.range;
    const location = `${start.line + DISPLAY_OFFSET}:${start.character + DISPLAY_OFFSET}-${end.line + DISPLAY_OFFSET}:${end.character + DISPLAY_OFFSET}`;
    const origin = [diagnostic.source, diagnostic.code]
      .filter((value) => value !== undefined)
      .join(" ");
    lines.push(
      "",
      `${diagnostic.severity}${origin ? ` [${origin}]` : ""} at ${location}: ${diagnostic.message}`,
    );
    if (diagnostic.selectedText) lines.push("Selected text:", diagnostic.selectedText);
    if (diagnostic.contextLines.length > 0) {
      lines.push(
        "Context:",
        ...diagnostic.contextLines.map((line) => `${line.line + DISPLAY_OFFSET} | ${line.text}`),
      );
    }
  }
  lines.push("</ide-diagnostics>");
  return lines.join("\n");
}
