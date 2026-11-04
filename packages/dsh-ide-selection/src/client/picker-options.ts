// ABOUTME: Present compact status-picker rows without changing the slash command's options.
// ABOUTME: Use live connection state for badges and actions, and keep full details in hints.
import { AUTO_TARGET_ID, OFF_TARGET_ID, type IdeTargetOverview } from "../shared/target.js";
import type { SelectOption } from "./command-ui.js";
import { targetOptions, type Translate } from "./targets.js";

const WORKSPACE_TAIL_SEGMENTS = 2;

/** A compact popup row with the full description available on hover and to assistive tools. */
export interface PickerOption extends SelectOption {
  readonly title?: string;
  readonly targetId: string;
}

/** Show matching IDEs; only a live target is marked connected and offers disconnection. */
export function pickerOptions(
  overview: IdeTargetOverview,
  t: Translate,
  connected: boolean,
): PickerOption[] {
  const matchingIdes = overview.ides.filter((ide) => ide.workspaceMatched);
  const options = targetOptions({ ...overview, ides: matchingIdes }, t);
  const ides = new Map(matchingIdes.map((ide) => [ide.id, ide]));
  const workspaces = new Map(
    matchingIdes.map((ide) => [
      ide.id,
      ide.workspaceFolders.map(compactWorkspace).join(", ") || t("workspace.unknown"),
    ]),
  );
  return options
    .filter((option) => option.id !== AUTO_TARGET_ID && option.id !== OFF_TARGET_ID)
    .map((option): PickerOption => {
      const { detail, group: _group, ...row } = option;
      const title = detail ?? option.label;
      const ide = ides.get(option.id)!;
      const workspace = workspaces.get(ide.id);
      const ambiguous = matchingIdes.some(
        (other) =>
          other.id !== ide.id && other.name === ide.name && workspaces.get(other.id) === workspace,
      );
      const active =
        connected &&
        (overview.selection.kind === "auto"
          ? overview.automaticId === ide.id
          : option.active === true);
      return {
        ...row,
        detail: [workspace, ...(ambiguous ? [`${ide.host}:${ide.port}`] : [])].join(" · "),
        active,
        targetId: active ? OFF_TARGET_ID : ide.id,
        title,
      };
    });
}

function compactWorkspace(workspace: string): string {
  const parts = workspace.split(/[\\/]+/).filter(Boolean);
  if (parts.length <= WORKSPACE_TAIL_SEGMENTS) return workspace;
  const separator = workspace.includes("\\") ? "\\" : "/";
  return ["…", ...parts.slice(-WORKSPACE_TAIL_SEGMENTS)].join(separator);
}
