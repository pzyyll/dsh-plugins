// ABOUTME: Verify editor context actions forward file and selection references to DSH.
// ABOUTME: Cover menu visibility, real selection extraction, trust, and failed delivery.
import { readFile } from "node:fs/promises";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as vscode from "vscode";
import { IdeServer } from "../../../src/shared/server.js";

const { state } = vi.hoisted(() => ({
  state: {
    trusted: true,
    editor: undefined as unknown,
    commands: new Map<string, () => void>(),
    warnings: [] as string[],
    statuses: [] as string[],
  },
}));
vi.mock("vscode", () => ({
  commands: {
    registerCommand: (name: string, handler: () => void) => {
      state.commands.set(name, handler);
      return { dispose: () => state.commands.delete(name) };
    },
  },
  window: {
    get activeTextEditor() {
      return state.editor;
    },
    tabGroups: { activeTabGroup: {}, all: [] },
    showWarningMessage: (message: string) => state.warnings.push(message),
    setStatusBarMessage: (message: string) => state.statuses.push(message),
  },
  workspace: {
    get isTrusted() {
      return state.trusted;
    },
    getWorkspaceFolder: () => ({ uri: { fsPath: "/work" } }),
  },
}));

import { ADD_TO_CHAT_COMMAND, registerAddToChat } from "../src/chat.js";

beforeEach(() => {
  state.trusted = true;
  state.editor = {
    document: {
      uri: { scheme: "file", fsPath: "/work/example.ts" },
      getText: () => "selected source",
    },
    selections: [],
  };
  state.commands.clear();
  state.warnings = [];
  state.statuses = [];
});

function register(server?: IdeServer) {
  const context = { subscriptions: [] as vscode.Disposable[] } as vscode.ExtensionContext;
  registerAddToChat(context, () => server);
  return { run: state.commands.get(ADD_TO_CHAT_COMMAND)!, context };
}

describe("Add to DSH Chat", () => {
  it("shows a separate DSH menu group for trusted local files without requiring selected text", async () => {
    const manifest = JSON.parse(
      await readFile(new URL("../package.json", import.meta.url), "utf8"),
    );
    const menu = manifest.contributes.menus["editor/context"].find(
      (entry: { command: string }) => entry.command === ADD_TO_CHAT_COMMAND,
    );
    expect(menu.when).toBe("isWorkspaceTrusted && resourceScheme == file");
    expect(menu.group).toBe("2_dsh_ide_selection");
    const command = manifest.contributes.commands.find(
      (entry: { command: string }) => entry.command === ADD_TO_CHAT_COMMAND,
    );
    expect(command.title).toBe("Add to DSH Chat");
    expect(command.enablement).toBe(menu.when);
  });

  it("forwards the file with empty ranges when nothing is selected and disposes the command", () => {
    const server = new IdeServer("test-token", () => undefined);
    const attach = vi.spyOn(server, "attach").mockReturnValue(true);
    const { run, context } = register(server);
    run();
    expect(attach).toHaveBeenCalledExactlyOnceWith({
      source: "vscode",
      filePath: "/work/example.ts",
      workspaceFolder: "/work",
      ranges: [],
    });
    expect(state.statuses).toEqual(["DSH added @example.ts to chat"]);
    expect(state.warnings).toEqual([]);
    context.subscriptions.forEach((subscription) => subscription.dispose());
    expect(state.commands.has(ADD_TO_CHAT_COMMAND)).toBe(false);
  });

  it("forwards selected text and reports its pi-x-ide-style range reference", () => {
    state.editor = {
      ...(state.editor as object),
      selections: [
        {
          isEmpty: false,
          start: { line: 9, character: 0 },
          end: { line: 11, character: 1 },
        },
      ],
    };
    const server = new IdeServer("test-token", () => undefined);
    const attach = vi.spyOn(server, "attach").mockReturnValue(true);
    register(server).run();
    expect(attach.mock.calls[0]?.[0].ranges[0]?.text).toBe("selected source");
    expect(state.statuses).toEqual(["DSH added @example.ts#L10-L12 to chat"]);
  });

  it("warns without claiming delivery when the Host is disconnected", () => {
    register().run();
    expect(state.warnings.join(" ")).toContain("no client is connected");
    expect(state.statuses).toEqual([]);
  });

  it("does not forward in an untrusted workspace or a non-file editor", () => {
    const server = new IdeServer("test-token", () => undefined);
    const attach = vi.spyOn(server, "attach");
    const { run } = register(server);
    state.trusted = false;
    run();
    expect(attach).not.toHaveBeenCalled();
    state.trusted = true;
    state.editor = {
      document: { uri: { scheme: "untitled" } },
      selections: [],
    };
    run();
    expect(attach).not.toHaveBeenCalled();
    expect(state.warnings.join(" ")).toContain("open a local file");
  });
});
