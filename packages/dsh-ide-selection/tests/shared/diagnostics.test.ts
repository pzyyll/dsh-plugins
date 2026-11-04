// ABOUTME: Check diagnostic wire validation and explicit prompt formatting.
// ABOUTME: Reject invalid ranges, excessive context, and unsupported diagnostic severities.
import { describe, expect, it } from "vitest";
import {
  formatDiagnosticContext,
  MAX_DIAGNOSTIC_CONTEXT_LINES,
  MAX_DIAGNOSTIC_MESSAGE_CHARS,
  MAX_DIAGNOSTIC_PAYLOAD_CHARS,
  MAX_DIAGNOSTICS,
  parseDiagnosticContext,
} from "../../src/shared/diagnostics.js";
import type { DiagnosticContext } from "../../src/shared/protocol.js";

const context: DiagnosticContext = {
  source: "vscode",
  filePath: "/work/app/src/example.ts",
  workspaceFolder: "/work/app",
  documentVersion: 3,
  diagnostics: [
    {
      severity: "error",
      message: "Cannot find name 'missing'.",
      source: "ts",
      code: 2304,
      range: { start: { line: 9, character: 2 }, end: { line: 9, character: 9 } },
      selectedText: "missing",
      contextLines: [{ line: 9, text: "  missing();" }],
    },
  ],
};

describe("diagnostic context", () => {
  it("keeps the error identity, version, one-based range, selected text, and context", () => {
    expect(parseDiagnosticContext(context)).toEqual(context);
    const text = formatDiagnosticContext(context);
    expect(text).toContain("File: /work/app/src/example.ts");
    expect(text).toContain("document version 3");
    expect(text).toContain("error [ts 2304] at 10:3-10:10: Cannot find name 'missing'.");
    expect(text).toContain("Selected text:\nmissing");
    expect(text).toContain("10 |   missing();");
    expect(text).toMatch(/^<ide-diagnostics>[\s\S]*<\/ide-diagnostics>$/);
  });

  it.each([
    { source: "browser" },
    { filePath: "bad\0path" },
    { workspaceFolder: "bad\0path" },
    { documentVersion: -1 },
    { diagnostics: [] },
    { diagnostics: Array.from({ length: MAX_DIAGNOSTICS + 1 }, () => context.diagnostics[0]) },
  ])("rejects invalid envelopes: %j", (patch) => {
    expect(parseDiagnosticContext({ ...context, ...patch })).toBeUndefined();
  });

  it.each([
    { severity: "hint" },
    { message: "x".repeat(MAX_DIAGNOSTIC_MESSAGE_CHARS + 1) },
    { code: Number.NaN },
    { source: {} },
    { selectedText: 42 },
    { range: { start: { line: 2, character: 0 }, end: { line: 1, character: 0 } } },
    { range: { start: { line: 0, character: 2 }, end: { line: 0, character: 1 } } },
    { range: { start: { line: 0.5, character: 0 }, end: { line: 1, character: 0 } } },
    { contextLines: [{ line: -1, text: "invalid" }] },
    {
      contextLines: Array.from({ length: MAX_DIAGNOSTIC_CONTEXT_LINES + 1 }, () => ({
        line: 0,
        text: "",
      })),
    },
  ])("rejects invalid diagnostic fields: %j", (patch) => {
    expect(
      parseDiagnosticContext({
        ...context,
        diagnostics: [{ ...context.diagnostics[0], ...patch }],
      }),
    ).toBeUndefined();
  });

  it("bounds the entire serialized payload, not just each diagnostic", () => {
    const diagnostic = {
      ...context.diagnostics[0]!,
      contextLines: Array.from({ length: MAX_DIAGNOSTIC_CONTEXT_LINES }, () => ({
        line: 0,
        text: "x".repeat(1_000),
      })),
    };
    const oversized = {
      ...context,
      diagnostics: Array.from({ length: MAX_DIAGNOSTICS }, () => diagnostic),
    };
    expect(JSON.stringify(oversized).length).toBeGreaterThan(MAX_DIAGNOSTIC_PAYLOAD_CHARS);
    expect(parseDiagnosticContext(oversized)).toBeUndefined();
  });
});
