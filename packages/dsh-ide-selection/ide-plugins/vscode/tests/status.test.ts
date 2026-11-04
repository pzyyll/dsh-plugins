// ABOUTME: Verify the VS Code status item against real authenticated bridge connections.
// ABOUTME: Cover normal client counts, editor icons, output access, and deterministic disposal.
import WebSocket from "ws";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { state } = vi.hoisted(() => ({
  state: {
    items: [] as Array<{
      text?: string;
      tooltip?: string;
      command?: string;
      show: ReturnType<typeof vi.fn>;
      dispose: ReturnType<typeof vi.fn>;
    }>,
    commands: new Map<string, () => void>(),
  },
}));

vi.mock("vscode", () => ({
  StatusBarAlignment: { Right: 2 },
  window: {
    createStatusBarItem: vi.fn(() => {
      const item = { show: vi.fn(), dispose: vi.fn() };
      state.items.push(item);
      return item;
    }),
  },
  commands: {
    registerCommand: vi.fn((name: string, handler: () => void) => {
      state.commands.set(name, handler);
      return { dispose: () => state.commands.delete(name) };
    }),
  },
}));

import type * as vscode from "vscode";
import { AUTH_HEADER } from "../../../src/shared/protocol.js";
import { IdeServer } from "../../../src/shared/server.js";
import { IdeStatusBar, SHOW_CONNECTION_STATUS_COMMAND } from "../src/status.js";

const TOKEN = "s".repeat(64);
const servers: IdeServer[] = [];
const bars: IdeStatusBar[] = [];

beforeEach(() => {
  state.items = [];
  state.commands.clear();
});
afterEach(async () => {
  for (const bar of bars.splice(0)) bar.dispose();
  await Promise.all(servers.splice(0).map((server) => server.stop()));
});

async function setup() {
  const server = new IdeServer(TOKEN, () => undefined);
  servers.push(server);
  await server.start();
  const lines: string[] = [];
  const show = vi.fn();
  const output = {
    appendLine: (line: string) => lines.push(line),
    show,
  } as unknown as vscode.OutputChannel;
  const bar = new IdeStatusBar(server, output);
  bars.push(bar);
  return { server, bar, item: state.items[0]!, lines, show };
}

function connect(server: IdeServer): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`ws://127.0.0.1:${server.port}`, {
      headers: { [AUTH_HEADER]: TOKEN },
    });
    socket.once("open", () => resolve(socket));
    socket.once("error", reject);
  });
}

describe("VS Code connection status", () => {
  it("updates ordinary client counts on connect and disconnect without an editor event", async () => {
    const { server, item, lines } = await setup();
    expect(item.text).toBe("$(plug) DSH: waiting");
    const first = await connect(server);
    await vi.waitFor(() => expect(item.text).toBe("$(plug) DSH: connected"));
    expect(item.tooltip).toContain("Bridge clients: 1.");
    const second = await connect(server);
    await vi.waitFor(() => expect(item.tooltip).toContain("Bridge clients: 2."));
    first.close();
    await vi.waitFor(() => expect(item.tooltip).toContain("Bridge clients: 1."));
    expect(item.text).toBe("$(plug) DSH: connected");
    second.close();
    await vi.waitFor(() => expect(item.text).toBe("$(plug) DSH: waiting"));
    expect(item.tooltip).toContain("Bridge clients: 0.");
    expect(lines.join("\n")).not.toMatch(/selection only|diagnostic inputs|Fix inputs|ready/);
  });

  it("uses upstream editor icons and opens output without exposing code or credentials", async () => {
    const { bar, item, lines, show } = await setup();
    bar.updateSelection({
      source: "vscode",
      filePath: "/work/app/main.ts",
      ranges: [
        {
          text: "private selected text",
          selection: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
        },
      ],
    });
    expect(item.text).toContain("$(symbol-string)");
    bar.updateSelection({ source: "vscode", filePath: "/work/app/main.ts", ranges: [] });
    expect(item.text).toContain("$(file-code)");
    expect(item.command).toBe(SHOW_CONNECTION_STATUS_COMMAND);
    state.commands.get(SHOW_CONNECTION_STATUS_COMMAND)!();
    expect(show).toHaveBeenCalledWith(true);
    expect(lines.join("\n")).toContain("Quick Fix requires an Error or Warning");
    expect(lines.join("\n")).not.toContain("private selected text");
    expect(lines.join("\n")).not.toContain(TOKEN);
  });

  it("stops observing after disposal and releases the item and command once", async () => {
    const { server, bar, item } = await setup();
    bar.dispose();
    bar.dispose();
    const renders = item.show.mock.calls.length;
    const socket = await connect(server);
    await vi.waitFor(() => expect(server.clientCount).toBe(1));
    expect(item.show).toHaveBeenCalledTimes(renders);
    expect(item.dispose).toHaveBeenCalledOnce();
    expect(state.commands.has(SHOW_CONNECTION_STATUS_COMMAND)).toBe(false);
    socket.close();
  });
});
