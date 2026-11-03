// ABOUTME: Tests the stable protocol constants and selection/lock type contracts.
// ABOUTME: Keeps the DSH-facing wire shapes aligned with Pi x IDE protocol v1.
import { describe, expect, it } from "vitest";
import {
  AUTH_HEADER,
  PROTOCOL_VERSION,
  type EditorSelectionSnapshot,
  type IdeLockFile,
} from "./protocol.js";

describe("protocol", () => {
  it("exports the upstream v1 protocol and auth header", () => {
    expect(PROTOCOL_VERSION).toBe(1);
    expect(AUTH_HEADER).toBe("x-pi-x-ide-authorization");
  });

  it("represents the VS Code selection and lock payloads", () => {
    const selection: EditorSelectionSnapshot = {
      source: "vscode",
      filePath: "/work/app/a.ts",
      workspaceFolder: "/work/app",
      ranges: [
        {
          text: "x",
          selection: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
        },
      ],
    };
    const lock: IdeLockFile = {
      version: 1,
      ide: "vscode",
      name: "Visual Studio Code",
      transport: "ws",
      host: "127.0.0.1",
      port: 1234,
      authToken: "a".repeat(64),
      workspaceFolders: ["/work/app"],
      pid: 42,
      runningInWindows: false,
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
    };
    expect(selection.ranges[0]?.text).toBe("x");
    expect(lock.ide).toBe("vscode");
  });
});
