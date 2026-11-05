// ABOUTME: Render IDE selections in the selected-context reminder format.
// ABOUTME: Adapted from pi-x-ide (Apache-2.0); bound text across selected ranges.
import { isAbsolute, relative, sep } from "node:path";
import type { EditorSelectionSnapshot } from "./protocol.js";

const DEFAULT_MAX_CHARS = 24_000;
const LINE_OFFSET = 1;
const TRUNCATION_NOTICE = "\n[Selection text truncated to keep the prompt size bounded.]";

/** Format the first selected range as a pi-x-ide-style input reference. */
export function formatRangeMention(snapshot: EditorSelectionSnapshot): string {
  let path = snapshot.filePath;
  if (snapshot.workspaceFolder) {
    const rel = relative(snapshot.workspaceFolder, path);
    if (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel)) path = rel;
  }
  path = path.replaceAll("\\", "/");
  const first = snapshot.ranges[0];
  if (!first) return `@${path}`;
  const start = first.selection.start.line + LINE_OFFSET;
  const end = first.selection.end.line + LINE_OFFSET;
  return `@${path}#L${start}${start === end ? "" : `-L${end}`}`;
}

/** Render local editor context without reading any file from disk. */
export function formatEditorContext(
  snapshot: EditorSelectionSnapshot,
  options: { maxChars?: number } = {},
): string {
  const maxChars = options.maxChars ?? DEFAULT_MAX_CHARS;
  if (!Number.isSafeInteger(maxChars) || maxChars <= 0) {
    throw new RangeError("maxChars must be a positive safe integer");
  }
  if (snapshot.ranges.length === 0) {
    return `<system-reminder><selected-context>\nThe user currently has \`${snapshot.filePath}\` open in ${snapshot.source}. This may or may not be relevant.\n</selected-context></system-reminder>\n`;
  }

  const sections: string[] = [];
  let remaining = maxChars;
  let truncated = false;
  for (const [index, range] of snapshot.ranges.entries()) {
    if (remaining === 0) {
      truncated = true;
      break;
    }
    const start = range.selection.start.line + LINE_OFFSET;
    const end = range.selection.end.line + LINE_OFFSET;
    const lineRange = start === end ? `L${start}` : `L${start}-L${end}`;
    const label =
      snapshot.ranges.length === 1 ? "The user selected" : `Selection ${index + LINE_OFFSET}`;
    const text = range.text.slice(0, remaining);
    truncated ||= text.length < range.text.length;
    remaining -= text.length;
    sections.push(
      `${label} ${lineRange} from \`${snapshot.filePath}\` in ${snapshot.source}:\n\`\`\`\n${text}\n\`\`\``,
    );
  }
  return `<system-reminder><selected-context>\n${sections.join("\n")}\nThis may or may not be relevant.${truncated ? TRUNCATION_NOTICE : ""}\n</selected-context></system-reminder>\n`;
}
