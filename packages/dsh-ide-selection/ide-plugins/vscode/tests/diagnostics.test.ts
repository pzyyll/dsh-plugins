// ABOUTME: Tests VS Code diagnostic quick-fix filtering and bounded context extraction.
// ABOUTME: Verifies explicit forwarding, no-client behavior, command registration, and status feedback.
import { beforeEach, describe, expect, it, vi } from "vitest";

const { state } = vi.hoisted(() => {
  class Range {
    readonly start: unknown;
    readonly end: unknown;
    constructor(start: unknown, end: unknown, endLine?: number, endCharacter?: number) {
      if (
        typeof start === "number" &&
        typeof end === "number" &&
        endLine !== undefined &&
        endCharacter !== undefined
      ) {
        this.start = { line: start, character: end };
        this.end = { line: endLine, character: endCharacter };
      } else {
        this.start = start;
        this.end = end;
      }
    }
  }
  class Diagnostic {
    source?: string;
    code?: unknown;
    constructor(
      readonly range: unknown,
      readonly message: string,
      readonly severity: number,
    ) {}
  }
  class CodeActionKind {
    static readonly QuickFix = new CodeActionKind("quickfix");
    static readonly Source = new CodeActionKind("source");
    constructor(readonly value: string) {}
    contains(kind: { value: string }): boolean {
      return kind.value === this.value || kind.value.startsWith(`${this.value}.`);
    }
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
    CodeActionKind,
    Diagnostic,
    Range,
  };
  return { state };
});

vi.mock("vscode", () => ({
  CodeAction: state.CodeAction,
  Range: state.Range,
  Diagnostic: state.Diagnostic,
  CodeActionKind: state.CodeActionKind,
  CodeActionTriggerKind: { Invoke: 1 },
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
  FIX_DIAGNOSTIC_COMMAND,
  SEND_DIAGNOSTIC_COMMAND,
} from "../src/diagnostics.js";

function diagnostic(
  severity: vscode.DiagnosticSeverity,
  startLine = 3,
  endLine = startLine,
): vscode.Diagnostic {
  const value = new vscode.Diagnostic(
    new vscode.Range(startLine, 1, endLine, 9),
    "problem",
    severity,
  );
  value.source = "ts";
  value.code = 2345;
  return value;
}

function actionContext(
  diagnostics: readonly vscode.Diagnostic[],
  only?: vscode.CodeActionKind,
): vscode.CodeActionContext {
  return { diagnostics, only, triggerKind: vscode.CodeActionTriggerKind.Invoke };
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
    const server = { clientCount: 1 } as never;
    const provider = new DiagnosticCodeActionProvider(() => server);
    const actions = provider.provideCodeActions(
      doc.value,
      {} as vscode.Range,
      actionContext([diagnostic(2), diagnostic(0), diagnostic(1)]),
    );

    expect(actions).toHaveLength(2);
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

  it("offers both Fix and Send for a plain connected client with no capability handshake", () => {
    const doc = document();
    const context = actionContext([diagnostic(0)]);
    const provider = new DiagnosticCodeActionProvider(() => ({ clientCount: 1 }) as never);
    const actions = provider.provideCodeActions(
      doc.value,
      {} as vscode.Range,
      context,
    ) as unknown as Array<{
      title: string;
      command: { command: string; arguments: Array<{ action: string }> };
    }>;
    expect(actions.map((action) => action.command.command)).toEqual([
      FIX_DIAGNOSTIC_COMMAND,
      SEND_DIAGNOSTIC_COMMAND,
    ]);
    expect(actions.map((action) => action.command.arguments[0]!.action)).toEqual([
      "fix",
      "send-diagnostic",
    ]);
  });

  it("does not offer stale actions without a connected client or outside trusted file workspaces", () => {
    const doc = document();
    const noClient = new DiagnosticCodeActionProvider(() => ({ clientCount: 0 }) as never);
    const context = actionContext([diagnostic(0)]);
    expect(noClient.provideCodeActions(doc.value, {} as vscode.Range, context)).toEqual([]);
    state.trusted = false;
    expect(
      new DiagnosticCodeActionProvider(() => ({ clientCount: 1 }) as never).provideCodeActions(
        doc.value,
        {} as vscode.Range,
        context,
      ),
    ).toEqual([]);
  });

  it("requires an Error or Warning diagnostic rather than just a code selection", () => {
    const doc = document();
    const provider = new DiagnosticCodeActionProvider(() => ({ clientCount: 1 }) as never);
    expect(provider.provideCodeActions(doc.value, {} as vscode.Range, actionContext([]))).toEqual(
      [],
    );
    expect(
      provider.provideCodeActions(
        doc.value,
        {} as vscode.Range,
        actionContext([diagnostic(2), diagnostic(3)]),
      ),
    ).toEqual([]);
    expect(
      provider.provideCodeActions(
        doc.value,
        {} as vscode.Range,
        actionContext([diagnostic(0)], vscode.CodeActionKind.Source),
      ),
    ).toEqual([]);
    expect(
      provider.provideCodeActions(
        { ...doc.value, uri: { scheme: "untitled" } } as vscode.TextDocument,
        {} as vscode.Range,
        actionContext([diagnostic(0)]),
      ),
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

  it("forces each command's action and preserves success and no-client feedback", () => {
    const sendDiagnostics = vi.fn(() => true);
    const server = { clientCount: 1, sendDiagnostics } as never;
    const context = { subscriptions: [] as vscode.Disposable[] } as vscode.ExtensionContext;
    registerDiagnosticQuickFixes(context, () => server);
    const payload = {
      ...createDiagnosticContext(document().value, [diagnostic(0)])!,
      action: "fix" as const,
    };

    state.commands.get(SEND_DIAGNOSTIC_COMMAND)!(payload);
    expect(sendDiagnostics).toHaveBeenLastCalledWith({ ...payload, action: "send-diagnostic" });
    expect(state.statuses.join()).toContain("forwarded");

    state.commands.get(FIX_DIAGNOSTIC_COMMAND)!({ ...payload, action: "send-diagnostic" });
    expect(sendDiagnostics).toHaveBeenLastCalledWith({ ...payload, action: "fix" });
    expect(state.statuses).toHaveLength(2);
    expect(state.warnings).toEqual([]);

    sendDiagnostics.mockReturnValueOnce(false);
    state.commands.get(FIX_DIAGNOSTIC_COMMAND)!(payload);
    expect(state.warnings.join()).toContain("no client is connected");
    expect(state.statuses).toHaveLength(2);

    sendDiagnostics.mockReturnValue(false);
    state.commands.get(SEND_DIAGNOSTIC_COMMAND)!(payload);
    expect(state.warnings).toHaveLength(2);
    expect(context.subscriptions).toHaveLength(3);
  });
});
