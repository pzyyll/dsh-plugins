// ABOUTME: Check selected-context rendering for open files and selected ranges.
// ABOUTME: Cover upstream-compatible line labels and shared selection text limits.
import { describe, expect, it } from "vitest";
import { formatEditorContext, formatRangeMention } from "../../src/shared/format.js";
import type { EditorSelectionSnapshot } from "../../src/shared/protocol.js";

const snapshot: EditorSelectionSnapshot = {
  source: "vscode",
  filePath: "/project/example.ts",
  ranges: [
    {
      text: "const x = 1;",
      selection: { start: { line: 0, character: 0 }, end: { line: 1, character: 0 } },
    },
  ],
};

describe("selected context", () => {
  it("formats a workspace-relative reference using the first selection, as pi-x-ide does", () => {
    expect(formatRangeMention({ ...snapshot, workspaceFolder: "/project" })).toBe(
      "@example.ts#L1-L2",
    );
    expect(formatRangeMention({ ...snapshot, ranges: [] })).toBe("@/project/example.ts");
    expect(formatRangeMention({ ...snapshot, workspaceFolder: "/elsewhere" })).toBe(
      "@/project/example.ts#L1-L2",
    );
  });

  it("keeps upstream reminder markers, text, and one-based line labels", () => {
    const text = formatEditorContext(snapshot);
    expect(text).toContain("<system-reminder><selected-context>");
    expect(text).toContain("The user selected L1-L2 from `/project/example.ts` in vscode:");
    expect(text).toContain("const x = 1;");
    expect(text).toContain("This may or may not be relevant.");
  });

  it("describes an open file without reading its contents", () => {
    expect(formatEditorContext({ ...snapshot, ranges: [] })).toContain(
      "currently has `/project/example.ts` open",
    );
  });

  it("bounds text across multiple selections and reports omitted selections", () => {
    const ranges = [snapshot.ranges[0]!, { ...snapshot.ranges[0]!, text: "second" }];
    const rendered = formatEditorContext(
      { ...snapshot, ranges },
      { maxChars: ranges[0]!.text.length },
    );
    expect(rendered).toContain("Selection 1 L1-L2");
    expect(rendered).not.toContain("second");
    expect(rendered).toContain("[Selection text truncated");
  });

  it("uses one shared text budget for all selections", () => {
    const range = snapshot.ranges[0]!;
    const text = formatEditorContext(
      {
        ...snapshot,
        ranges: [
          { ...range, text: "abcd" },
          { ...range, text: "efgh" },
        ],
      },
      { maxChars: 6 },
    );
    expect(text).toContain("abcd");
    expect(text).toContain("\nef\n");
    expect(text).not.toContain("efgh");
  });
});
