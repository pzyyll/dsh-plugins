// ABOUTME: Check the compact composer label and its hover detail.
// ABOUTME: Cover an idle connection, one line, one range, and multiple ranges.
import { describe, expect, it } from "vitest";
import type { EditorSelectionSnapshot } from "../../src/shared/protocol.js";
import { selectionStatusText } from "../../src/shared/status.js";

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
    expect(selectionStatusText()).toEqual({ text: "⧉", lines: 0 });
    expect(selectionStatusText({ ...snapshot, ranges: [] })).toEqual({ text: "⧉", lines: 0 });
  });

  it("names a one-line selection without a count", () => {
    const status = selectionStatusText({
      ...snapshot,
      ranges: [
        {
          text: "one secret line",
          selection: { start: { line: 4, character: 2 }, end: { line: 4, character: 9 } },
        },
      ],
    });
    expect(status).toEqual({ text: "⧉ Selected", lines: 1, detail: "src/example.ts #L5" });
  });

  it("counts inclusive lines and puts the file and range in the hover detail", () => {
    expect(selectionStatusText(snapshot)).toEqual({
      text: "⧉ 3 Lines Selected",
      lines: 3,
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
    expect(status.text).toBe("⧉ 4 Lines Selected");
    expect(status.detail).toBe("src/example.ts 1:#L10-L12 2:#L21");
    expect(JSON.stringify(status)).not.toContain("secret");
  });
});
