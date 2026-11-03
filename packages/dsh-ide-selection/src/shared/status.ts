// ABOUTME: Format the connected IDE selection for the composer status pill.
// ABOUTME: Keep the visible label compact and leave the file and ranges for hover text.
import { isAbsolute, relative, sep } from "node:path";
import type { EditorSelectionSnapshot, SelectionRange } from "./protocol.js";

const CONNECTED_ICON = "⧉";
const SINGLE_LINE_LABEL = "Selected";
const MULTI_LINE_LABEL = "Lines Selected";
const LINE_OFFSET = 1;

/** Render a connected editor. No snapshot means the IDE has no active selection. */
export function selectionStatusText(snapshot?: EditorSelectionSnapshot): {
  text: string;
  detail?: string;
} {
  const ranges = snapshot?.ranges ?? [];
  if (!snapshot || ranges.length === 0) return { text: CONNECTED_ICON };
  const selectedLines = ranges.reduce((total, range) => total + inclusiveLineCount(range), 0);
  return {
    text: `${CONNECTED_ICON} ${selectedLabel(selectedLines)}`,
    detail: `${displayPath(snapshot.filePath, snapshot.workspaceFolder)} ${describeRanges(ranges)}`,
  };
}

/** One line needs no count; more lines are worth spelling out as `N Lines Selected`. */
function selectedLabel(selectedLines: number): string {
  return selectedLines === 1 ? SINGLE_LINE_LABEL : `${selectedLines} ${MULTI_LINE_LABEL}`;
}

function inclusiveLineCount(range: SelectionRange): number {
  return range.selection.end.line - range.selection.start.line + LINE_OFFSET;
}

function describeRanges(ranges: readonly SelectionRange[]): string {
  if (ranges.length === 1) return lineLabel(ranges[0]!);
  return ranges.map((range, index) => `${index + LINE_OFFSET}:${lineLabel(range)}`).join(" ");
}

function lineLabel(range: SelectionRange): string {
  const start = range.selection.start.line + LINE_OFFSET;
  const end = range.selection.end.line + LINE_OFFSET;
  return start === end ? `#L${start}` : `#L${start}-L${end}`;
}

function displayPath(filePath: string, workspaceFolder?: string): string {
  if (!workspaceFolder) return filePath.split(sep).join("/");
  const rel = relative(workspaceFolder, filePath);
  if (!rel || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    return filePath.split(sep).join("/");
  }
  return rel.split(sep).join("/");
}
