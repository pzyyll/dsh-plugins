// ABOUTME: Verifies VS Code selection extraction and terminal-editor cache behavior.
// ABOUTME: Exercises real selection logic with a mocked VS Code API surface.
import { beforeEach, describe, expect, it, vi } from "vitest";

const { state, TabInputTerminal, TabInputText } = vi.hoisted(() => {
  class TabInputTerminal {}
  class TabInputText {
    constructor(readonly uri: { scheme: string; fsPath: string }) {}
  }
  const state = {
    activeTextEditor: undefined as unknown,
    activeTab: undefined as unknown,
    tabs: [] as unknown[],
    getWorkspaceFolder: vi.fn(),
  };
  return { state, TabInputTerminal, TabInputText };
});

vi.mock("vscode", () => ({
  window: {
    get activeTextEditor() {
      return state.activeTextEditor;
    },
    tabGroups: {
      get activeTabGroup() {
        return { activeTab: state.activeTab };
      },
      get all() {
        return [{ tabs: state.tabs }];
      },
    },
  },
  workspace: { getWorkspaceFolder: state.getWorkspaceFolder },
  TabInputTerminal,
  TabInputText,
  TabInputCustom: class {
    uri: unknown;
  },
  TabInputNotebook: class {
    uri: unknown;
  },
  TabInputTextDiff: class {
    original: unknown;
    modified: unknown;
  },
  TabInputNotebookDiff: class {
    original: unknown;
    modified: unknown;
  },
}));

function editor(
  path: string,
  selections: Array<{
    empty: boolean;
    text: string;
    start: { line: number; character: number };
    end: { line: number; character: number };
  }> = [],
) {
  const uri = { scheme: "file", fsPath: path };
  const document = {
    uri,
    getText: (selection: { text: string }) => selection.text,
  };
  return {
    document,
    selections: selections.map(({ empty, ...selection }) => ({ ...selection, isEmpty: empty })),
  };
}

beforeEach(() => {
  vi.resetModules();
  state.activeTextEditor = undefined;
  state.activeTab = undefined;
  state.tabs = [];
  state.getWorkspaceFolder.mockReset().mockReturnValue({ uri: { fsPath: "/work" } });
});

describe("getActiveSelectionSnapshot", () => {
  it("returns no snapshot without an active editor or for a non-file document", async () => {
    const { getActiveSelectionSnapshot } = await import("../src/selection.js");
    expect(getActiveSelectionSnapshot()).toBeUndefined();

    state.activeTextEditor = {
      document: { uri: { scheme: "untitled", fsPath: "untitled:buffer" }, getText: () => "text" },
      selections: [],
    };
    expect(getActiveSelectionSnapshot()).toBeUndefined();
  });

  it("collects multiple non-empty selections and includes workspace metadata", async () => {
    const active = editor("/work/file.ts", [
      {
        empty: false,
        text: "chosen",
        start: { line: 1, character: 2 },
        end: { line: 2, character: 0 },
      },
      {
        empty: false,
        text: "also chosen",
        start: { line: 4, character: 1 },
        end: { line: 4, character: 12 },
      },
      { empty: true, text: "", start: { line: 3, character: 0 }, end: { line: 3, character: 0 } },
    ]);
    state.activeTextEditor = active;
    const { getActiveSelectionSnapshot } = await import("../src/selection.js");

    expect(getActiveSelectionSnapshot()).toEqual({
      source: "vscode",
      filePath: "/work/file.ts",
      workspaceFolder: "/work",
      ranges: [
        {
          text: "chosen",
          selection: { start: { line: 1, character: 2 }, end: { line: 2, character: 0 } },
        },
        {
          text: "also chosen",
          selection: { start: { line: 4, character: 1 }, end: { line: 4, character: 12 } },
        },
      ],
    });
  });

  it("uses the cached file only while its terminal editor tab is active and the file remains open", async () => {
    state.activeTextEditor = editor("/work/file.ts", [
      {
        empty: false,
        text: "cached",
        start: { line: 0, character: 0 },
        end: { line: 0, character: 6 },
      },
    ]);
    const { getActiveSelectionSnapshot } = await import("../src/selection.js");
    const initial = getActiveSelectionSnapshot();
    expect(initial?.filePath).toBe("/work/file.ts");

    state.activeTextEditor = undefined;
    state.activeTab = { input: new TabInputTerminal() };
    state.tabs = [{ input: new TabInputText({ scheme: "file", fsPath: "/work/file.ts" }) }];
    expect(getActiveSelectionSnapshot()).toEqual(initial);

    state.tabs = [];
    expect(getActiveSelectionSnapshot()).toBeUndefined();
  });
});
