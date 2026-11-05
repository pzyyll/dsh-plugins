// ABOUTME: Verify IDE reference chips change only presentation, not the original sent path text.
// ABOUTME: Cover multi-selection, restored drafts, legacy snapshots, bounds, and cancellation.
import { describe, expect, it } from "vitest";
import { selectionReferenceSource } from "../../src/client/selection-references.js";
import {
  formatRangeMention,
  formatSelectionReference,
  formatSelectionReferences,
} from "../../src/shared/format.js";
import type { EditorSelectionSnapshot } from "../../src/shared/protocol.js";
import {
  MAX_SELECTION_REFERENCE_CHARS,
  selectionReferenceFromEvent,
} from "../../src/shared/selection-reference.js";

const snapshot: EditorSelectionSnapshot = {
  source: "vscode",
  filePath: "/work/app/src/main.tsx",
  workspaceFolder: "/work/app",
  ranges: [
    {
      text: "const original = '你好';\nrender(original);\n",
      selection: { start: { line: 32, character: 0 }, end: { line: 36, character: 5 } },
    },
  ],
};

const signal = () => new AbortController().signal;

describe("IDE selection references", () => {
  it("shows a filename and line range without storing selected code", () => {
    const reference = formatSelectionReference(snapshot);
    expect(reference).toMatchObject({
      source: "ide-selection",
      label: "main.tsx:33–37",
      appearance: "file",
      clipboardText: "@src/main.tsx#L33-L37",
    });
    expect(JSON.parse(reference.ref)).toEqual({ version: 1, mention: reference.clipboardText });
    expect(JSON.stringify(reference)).not.toContain("const original");
    expect(selectionReferenceFromEvent({ type: "selection", reference })).toEqual(reference);
  });

  it("sends the original path mention without adding a newline after draft restoration", async () => {
    const input = structuredClone(snapshot);
    const reference = formatSelectionReference(input);
    input.filePath = "/work/app/other.ts";
    input.ranges[0]!.text = "changed after attachment";
    const restored = JSON.parse(JSON.stringify(reference));
    const source = selectionReferenceSource();
    const text = await source.codec.serialize(restored.ref, signal());
    expect(text).toBe(formatRangeMention(snapshot));
    expect(source.codec.clipboardText(restored.ref)).toBe(reference.clipboardText);
    expect(await source.candidates()).toEqual([]);
  });

  it("preserves the original line-end convention instead of changing the sent range", async () => {
    const input = structuredClone(snapshot);
    input.ranges[0]!.selection.end = { line: 37, character: 0 };
    const reference = formatSelectionReference(input);
    expect(reference.label).toBe("main.tsx:33–38");
    expect(await selectionReferenceSource().codec.serialize(reference.ref, signal())).toBe(
      formatRangeMention(input),
    );
  });

  it("preserves every selected range in display, copying, persistence, and sent text", async () => {
    const multiple = structuredClone(snapshot);
    multiple.ranges.push({
      text: "second selection",
      selection: { start: { line: 50, character: 2 }, end: { line: 50, character: 7 } },
    });
    const source = selectionReferenceSource();
    const references = formatSelectionReferences(multiple);
    const mentions = ["@src/main.tsx#L33-L37", "@src/main.tsx#L51"];
    expect(references.map((reference) => reference.label)).toEqual([
      "main.tsx:33–37",
      "main.tsx:51",
    ]);
    expect(references.map((reference) => reference.clipboardText)).toEqual(mentions);
    for (const [index, reference] of references.entries()) {
      expect(source.codec.clipboardText(reference.ref)).toBe(mentions[index]);
      expect(selectionReferenceFromEvent({ type: "selection", reference })).toEqual(reference);
      expect(JSON.parse(reference.ref)).toEqual({ version: 1, mention: mentions[index] });
    }
    expect(JSON.stringify(references)).not.toContain("second selection");
    const restored = JSON.parse(JSON.stringify(references)) as typeof references;
    multiple.ranges = [];
    const serialized = await Promise.all(
      restored.map((reference) => source.codec.serialize(reference.ref, signal())),
    );
    expect(serialized).toEqual(mentions);
    expect(serialized.join(" ")).toBe("@src/main.tsx#L33-L37 @src/main.tsx#L51");
  });

  it("sends only a file path when nothing is selected", async () => {
    const source = selectionReferenceSource();
    const references = formatSelectionReferences({ ...snapshot, ranges: [] });
    expect(references).toHaveLength(1);
    const file = references[0]!;
    expect(file.label).toBe("main.tsx");
    expect(file.clipboardText).toBe("@src/main.tsx");
    expect(await source.codec.serialize(file.ref, signal())).toBe("@src/main.tsx");
  });

  it("handles Windows paths, spaces, and a single selected line without expanding them", async () => {
    const reference = formatSelectionReference({
      source: "vscode",
      filePath: "C:\\work\\my project\\main.tsx",
      ranges: [
        {
          text: "one line",
          selection: { start: { line: 0, character: 1 }, end: { line: 0, character: 4 } },
        },
      ],
    });
    expect(reference.label).toBe("main.tsx:1");
    expect(await selectionReferenceSource().codec.serialize(reference.ref, signal())).toBe(
      "@C:/work/my project/main.tsx#L1",
    );
  });

  it("ignores source text size and content when building a display reference", () => {
    const input = structuredClone(snapshot);
    input.ranges[0]!.text = "x".repeat(MAX_SELECTION_REFERENCE_CHARS);
    expect(formatSelectionReference(input)).toEqual(formatSelectionReference(snapshot));
    input.ranges[0]!.text = "";
    expect(formatSelectionReference(input)).toEqual(formatSelectionReference(snapshot));
  });

  it("sends only the path from a legacy draft that still contains a saved code snapshot", async () => {
    const reference = formatSelectionReference(snapshot);
    const legacy = {
      ...reference,
      ref: JSON.stringify({
        version: 1,
        mention: reference.clipboardText,
        text: "<system-reminder><selected-context>old code</selected-context></system-reminder>\n",
      }),
    };
    expect(selectionReferenceFromEvent({ type: "selection", reference: legacy })).toEqual(legacy);
    expect(await selectionReferenceSource().codec.serialize(legacy.ref, signal())).toBe(
      reference.clipboardText,
    );
  });

  it("blocks cancelled, malformed, and oversized reference serialization", async () => {
    const source = selectionReferenceSource();
    const controller = new AbortController();
    controller.abort();
    await expect(
      source.codec.serialize(formatSelectionReference(snapshot).ref, controller.signal),
    ).rejects.toThrow();
    for (const ref of [
      "not json",
      "null",
      "[]",
      JSON.stringify({ version: 2, mention: "@a" }),
      JSON.stringify({ version: 1, mention: "" }),
      "x".repeat(MAX_SELECTION_REFERENCE_CHARS + 1),
    ]) {
      await expect(source.codec.serialize(ref, signal())).rejects.toThrow();
    }
  });
});
