// ABOUTME: Check the compact composer label and its hover detail.
// ABOUTME: Cover an idle connection, one range, and multiple ranges without selected text.
import { describe, expect, it } from "vitest";
import type { EditorSelectionSnapshot } from "./protocol.js";
import { selectionStatusText } from "./status.js";

const snapshot: EditorSelectionSnapshot = {
  source: "vscode",
  filePath: "/work/app/src/example.ts",
  workspaceFolder: "/work/app",
  ranges: [
    {
      text: "secret selection",
      selection: { start: { line: 9, character: 0 }, end: { line: 11, character: 4 } },
    },
  ],
};

describe("selection status text", () => {
  it("shows only the connected icon when no lines are selected", () => {
    expect(selectionStatusText()).toEqual({ text: "⧉" });
    expect(selectionStatusText({ ...snapshot, ranges: [] })).toEqual({ text: "⧉" });
  });

  it("counts inclusive lines and puts the file and range in the hover detail", () => {
    expect(selectionStatusText(snapshot)).toEqual({
      text: "⧉ Selected Lines 3",
      detail: "src/example.ts #L10-L12",
    });
  });

  it("numbers every range without copying selected text", () => {
    const status = selectionStatusText({
      ...snapshot,
      ranges: [
        snapshot.ranges[0]!,
        {
          text: "another secret",
          selection: { start: { line: 20, character: 1 }, end: { line: 20, character: 3 } },
        },
      ],
    });
    expect(status.text).toBe("⧉ Selected Lines 4");
    expect(status.detail).toBe("src/example.ts 1:#L10-L12 2:#L21");
    expect(JSON.stringify(status)).not.toContain("secret");
  });
});
