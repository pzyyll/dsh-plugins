// ABOUTME: Tests VS Code diagnostic quick-fix filtering and bounded context extraction.
// ABOUTME: Verifies explicit forwarding, no-client behavior, command registration, and status feedback.
import { beforeEach, describe, expect, it, vi } from "vitest";

const { state } = vi.hoisted(() => {
  class Range {
    constructor(
      readonly start: unknown,
      readonly end: unknown,
    ) {}
  }
  class CodeAction {
    diagnostics: unknown[] = [];
    command: unknown;
    constructor(
      readonly title: string,
      readonly kind: unknown,
    ) {}
  }
  const state = {
    trusted: true,
    providers: [] as Array<{ selector: unknown; provider: unknown; metadata: unknown }>,
    commands: new Map<string, (...args: unknown[]) => unknown>(),
    statuses: [] as string[],
    warnings: [] as string[],
    CodeAction,
    Range,
  };
  return { state };
});

vi.mock("vscode", () => ({
  CodeAction: state.CodeAction,
  Range: state.Range,
  CodeActionKind: { QuickFix: { contains: (kind: unknown) => kind === "quickfix" } },
  DiagnosticSeverity: { Error: 0, Warning: 1, Information: 2, Hint: 3 },
  languages: {
    registerCodeActionsProvider: vi.fn((selector, provider, metadata) => {
      state.providers.push({ selector, provider, metadata });
      return { dispose: vi.fn() };
    }),
  },
  commands: {
    registerCommand: vi.fn((name, handler) => {
      state.commands.set(name, handler);
      return { dispose: vi.fn() };
    }),
  },
  window: {
    setStatusBarMessage: vi.fn((message: string) => state.statuses.push(message)),
    showWarningMessage: vi.fn((message: string) => state.warnings.push(message)),
  },
  workspace: {
    get isTrusted() {
      return state.trusted;
    },
    getWorkspaceFolder: vi.fn(() => ({ uri: { fsPath: "/work" } })),
  },
}));

import * as vscode from "vscode";
import {
  createDiagnosticContext,
  DiagnosticCodeActionProvider,
  registerDiagnosticQuickFixes,
  SEND_DIAGNOSTIC_COMMAND,
} from "../src/diagnostics.js";

function diagnostic(severity: number, startLine = 3, endLine = startLine) {
  return {
    severity,
    message: "problem",
    source: "ts",
    code: 2345,
    range: { start: { line: startLine, character: 1 }, end: { line: endLine, character: 9 } },
  };
}

function document(lineCount = 12, text = "selected") {
  const lineCalls: number[] = [];
  const getTextLengths: number[] = [];
  return {
    value: {
      uri: { scheme: "file", fsPath: "/work/main.ts" },
      version: 7,
      lineCount,
      getText: (range: {
        start: { line: number; character: number };
        end: { line: number; character: number };
      }) => {
        const offset = (position: { line: number; character: number }) =>
          position.line * 1_000_000 + position.character;
        const length = Math.max(0, offset(range.end) - offset(range.start));
        getTextLengths.push(length);
        return text.slice(0, length);
      },
      offsetAt: (position: { line: number; character: number }) =>
        position.line * 1_000_000 + position.character,
      positionAt: (offset: number) => ({
        line: Math.floor(offset / 1_000_000),
        character: offset % 1_000_000,
      }),
      lineAt: (line: number) => {
        lineCalls.push(line);
        return { text: `line-${line}` };
      },
    } as unknown as vscode.TextDocument,
    lineCalls,
    getTextLengths,
  };
}

beforeEach(() => {
  state.trusted = true;
  state.providers = [];
  state.commands.clear();
  state.statuses = [];
  state.warnings = [];
});

describe("diagnostic quick fixes", () => {
  it("filters to errors and warnings and preserves primitive or object diagnostic codes", () => {
    const doc = document();
    const server = { diagnosticClientCount: 1 } as never;
    const provider = new DiagnosticCodeActionProvider(() => server);
    const actions = provider.provideCodeActions(
      doc.value,
      {} as vscode.Range,
      {
        diagnostics: [diagnostic(2), diagnostic(0), diagnostic(1)],
      } as vscode.CodeActionContext,
    );

    expect(actions).toHaveLength(1);
    const action = actions[0] as unknown as {
      diagnostics: unknown[];
      command: { arguments: Array<{ diagnostics: Array<Record<string, unknown>> }> };
    };
    expect(action.diagnostics).toHaveLength(2);
    expect(action.command.arguments[0]!.diagnostics[0]).toMatchObject({
      severity: "error",
      source: "ts",
      code: 2345,
      selectedText: "selected",
    });
    expect(action.command.arguments[0]!.diagnostics[0]!.contextLines).toHaveLength(5);

    const objectCodePayload = createDiagnosticContext(doc.value, [
      {
        ...diagnostic(0),
        code: { value: "TS999", target: "https://example.test" },
      } as unknown as vscode.Diagnostic,
    ]);
    expect(objectCodePayload!.diagnostics[0]!.code).toBe("TS999");
  });

  it("does not offer stale actions without a diagnostic client or outside trusted file workspaces", () => {
    const doc = document();
    const noClient = new DiagnosticCodeActionProvider(
      () => ({ diagnosticClientCount: 0 }) as never,
    );
    const context = { diagnostics: [diagnostic(0)] } as vscode.CodeActionContext;
    expect(noClient.provideCodeActions(doc.value, {} as vscode.Range, context)).toEqual([]);
    state.trusted = false;
    expect(
      new DiagnosticCodeActionProvider(
        () => ({ diagnosticClientCount: 1 }) as never,
      ).provideCodeActions(doc.value, {} as vscode.Range, context),
    ).toEqual([]);
  });

  it("bounds messages, selected text, context lines, and huge multiline range iteration", () => {
    const doc = document(2_000_000, "x".repeat(20_000));
    const payload = createDiagnosticContext(doc.value, [diagnostic(0, 2, 1_900_000)]);
    expect(payload).toBeDefined();
    expect(payload!.diagnostics[0]!.selectedText.length).toBeLessThanOrEqual(4_000);
    expect(payload!.diagnostics[0]!.contextLines.length).toBeLessThanOrEqual(10);
    expect(doc.getTextLengths[0]).toBeLessThanOrEqual(4_001);
    expect(doc.lineCalls.length).toBeLessThanOrEqual(10);
    expect(doc.lineCalls.length).toBeLessThan(20);
  });

  it("registers send command and forwards without a no-client warning, reporting success status", () => {
    const sendDiagnostics = vi.fn(() => true);
    const server = { diagnosticClientCount: 1, sendDiagnostics } as never;
    const context = { subscriptions: [] as vscode.Disposable[] } as vscode.ExtensionContext;
    registerDiagnosticQuickFixes(context, () => server);
    const payload = createDiagnosticContext(document().value, [diagnostic(0)])!;
    state.commands.get(SEND_DIAGNOSTIC_COMMAND)!(payload);
    expect(sendDiagnostics).toHaveBeenCalledWith(payload);
    expect(state.statuses.join()).toContain("forwarded");
    expect(state.warnings).toEqual([]);

    sendDiagnostics.mockReturnValueOnce(false);
    state.commands.get(SEND_DIAGNOSTIC_COMMAND)!(payload);
    expect(state.warnings.join()).toContain("no matching composer");
    expect(state.statuses).toHaveLength(1);
    expect(context.subscriptions).toHaveLength(2);
  });
});
