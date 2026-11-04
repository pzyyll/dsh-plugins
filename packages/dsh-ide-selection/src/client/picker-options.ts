// ABOUTME: Present compact status-picker rows without changing the slash command's options.
// ABOUTME: Keep full connection details in hints and distinguish ambiguous workspace labels.
import { AUTO_TARGET_ID, OFF_TARGET_ID, type IdeTargetOverview } from "../shared/target.js";
import type { SelectOption } from "./command-ui.js";
import { targetOptions, type Translate } from "./targets.js";

const WORKSPACE_TAIL_SEGMENTS = 2;

/** A compact popup row with the full description available on hover and to assistive tools. */
export interface PickerOption extends SelectOption {
  readonly title?: string;
}

/** Put automatic selection first, manual IDEs next, and the single-line off action last. */
export function pickerOptions(overview: IdeTargetOverview, t: Translate): PickerOption[] {
  const options = targetOptions(overview, t);
  const ides = new Map(overview.ides.map((ide) => [ide.id, ide]));
  const workspaces = new Map(
    overview.ides.map((ide) => [
      ide.id,
      ide.workspaceFolders.map(compactWorkspace).join(", ") || t("workspace.unknown"),
    ]),
  );
  const automatic = overview.automaticId === undefined ? undefined : ides.get(overview.automaticId);
  return [
    ...options.filter((option) => option.id === AUTO_TARGET_ID),
    ...options.filter((option) => option.id !== AUTO_TARGET_ID),
  ].map((option): PickerOption => {
    const { detail, group: _group, ...row } = option;
    const title = detail ?? option.label;
    if (option.id === AUTO_TARGET_ID) {
      return {
        ...row,
        label: t("picker.auto"),
        detail: automatic?.workspaceMatched
          ? t("picker.autoTarget", { name: automatic.name })
          : (detail ?? t("auto.none")),
        title,
      };
    }
    if (option.id === OFF_TARGET_ID) {
      return { ...row, title };
    }
    const ide = ides.get(option.id);
    if (ide === undefined) return { ...option, title };
    const workspace = workspaces.get(ide.id);
    const ambiguous = overview.ides.some(
      (other) =>
        other.id !== ide.id && other.name === ide.name && workspaces.get(other.id) === workspace,
    );
    return {
      ...option,
      detail: [
        workspace,
        ...(ambiguous ? [`${ide.host}:${ide.port}`] : []),
        ...(ide.workspaceMatched ? [] : [t("ide.workspaceMismatch")]),
      ].join(" · "),
      group: { name: "ides", label: t("picker.manual") },
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
