// ABOUTME: Verify frozen IDE selection labels, durable codecs, and bounded source content.
// ABOUTME: Cover multiline ranges, multi-selection, restored drafts, cancellation, and malformed ids.
import { describe, expect, it } from "vitest";
import { selectionReferenceSource } from "../../src/client/selection-references.js";
import { formatSelectionReference } from "../../src/shared/format.js";
import type { EditorSelectionSnapshot } from "../../src/shared/protocol.js";
import {
  MAX_SELECTION_CONTEXT_CHARS,
  selectionReferenceFromEvent,
} from "../../src/shared/selection-reference.js";

const snapshot: EditorSelectionSnapshot = {
  source: "vscode",
  filePath: "/work/app/src/main.tsx",
  workspaceFolder: "/work/app",
  ranges: [
    {
      text: "const original = '你好';\nrender(original);\n",
      selection: { start: { line: 32, character: 0 }, end: { line: 37, character: 0 } },
    },
  ],
};

const signal = () => new AbortController().signal;

describe("IDE selection references", () => {
  it("shows a filename and inclusive line range while preserving a relative clipboard mention", () => {
    const reference = formatSelectionReference(snapshot);
    expect(reference).toMatchObject({
      source: "ide-selection",
      label: "main.tsx:33–37",
      appearance: "file",
      clipboardText: "@src/main.tsx#L33-L37",
    });
    expect(selectionReferenceFromEvent({ type: "selection", reference })).toEqual(reference);
  });

  it("serializes the added snapshot after persistence and a new codec registration", async () => {
    const input = structuredClone(snapshot);
    const original = input.ranges[0]!.text;
    const reference = formatSelectionReference(input);
    // The persisted id, not the active editor or a browser cache, is the source of truth.
    input.filePath = "/work/app/other.ts";
    input.ranges[0]!.text = "changed after attachment";
    const restored = JSON.parse(JSON.stringify(reference));
    const source = selectionReferenceSource();
    const text = await source.codec.serialize(restored.ref, signal());
    expect(text).toContain(original);
    expect(text).toContain("L33-L37");
    expect(text).toContain("/work/app/src/main.tsx");
    expect(text).not.toContain("changed after attachment");
    expect(text).not.toContain("other.ts");
    expect(source.codec.clipboardText(restored.ref)).toBe(reference.clipboardText);
    expect(await source.candidates()).toEqual([]);
  });

  it("keeps every range in one chip and leaves a file-only reference without fabricated content", async () => {
    const multiple = structuredClone(snapshot);
    multiple.ranges.push({
      text: "second selection",
      selection: { start: { line: 50, character: 2 }, end: { line: 50, character: 7 } },
    });
    const source = selectionReferenceSource();
    const reference = formatSelectionReference(multiple);
    expect(reference.label).toBe("main.tsx:33–37 (+1)");
    const text = await source.codec.serialize(reference.ref, signal());
    expect(text).toContain(snapshot.ranges[0]!.text);
    expect(text).toContain("second selection");
    expect(text).toContain("L51");

    const file = formatSelectionReference({ ...snapshot, ranges: [] });
    expect(file.label).toBe("main.tsx");
    expect(file.clipboardText).toBe("@src/main.tsx");
    const fileText = await source.codec.serialize(file.ref, signal());
    expect(fileText).toContain("currently has `/work/app/src/main.tsx` open");
    expect(fileText).not.toContain(snapshot.ranges[0]!.text);
  });

  it("handles Windows paths, spaces, and a single selected line", () => {
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
    expect(reference.clipboardText).toBe("@C:/work/my project/main.tsx#L1");
  });

  it("bounds large selections and repeated range headers before persistence", async () => {
    const input = structuredClone(snapshot);
    input.ranges[0]!.text = "x".repeat(MAX_SELECTION_CONTEXT_CHARS);
    const source = selectionReferenceSource();
    const text = await source.codec.serialize(formatSelectionReference(input).ref, signal());
    expect(text.length).toBeLessThanOrEqual(MAX_SELECTION_CONTEXT_CHARS);
    expect(text).toContain("Selection text truncated");
    // Empty ranges do not consume the source-text budget; their metadata must still be bounded.
    const MANY_RANGES = 1_000;
    input.ranges = Array.from({ length: MANY_RANGES }, () => ({ ...input.ranges[0]!, text: "" }));
    const metadata = await source.codec.serialize(formatSelectionReference(input).ref, signal());
    expect(metadata.length).toBeLessThanOrEqual(MAX_SELECTION_CONTEXT_CHARS);
    expect(metadata).toContain("Selection text truncated");
    expect(metadata).toMatch(/<\/selected-context><\/system-reminder>\n$/);
  });

  it("blocks cancelled and malformed reference serialization instead of sending only a path", async () => {
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
      JSON.stringify({ version: 2, mention: "@a", text: "a" }),
      JSON.stringify({ version: 1, mention: "@a", text: "" }),
    ]) {
      await expect(source.codec.serialize(ref, signal())).rejects.toThrow();
    }
  });
});
