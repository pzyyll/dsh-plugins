// ABOUTME: Build the /select-ide popup rows and talk to the host's target endpoints.
// ABOUTME: Treat the host payload as untrusted and surface every failure as a picker error.
import {
  AUTO_TARGET_ID,
  OFF_TARGET_ID,
  parseTargetOverview,
  type IdeTargetOverview,
  type IdeTargetRow,
} from "../shared/target.js";
import type { SelectOption } from "./command-ui.js";
import { fallbackText } from "./locales.js";

export const TARGET_OVERVIEW_URL = "/ide-selection/targets";
export const TARGET_SELECT_URL = "/ide-selection/target";

/** Translator face: the locale service's `bind()` or the English fallback. */
export type Translate = (key: string, params?: Record<string, unknown>) => string;

/** Load the reachable IDEs and this session's current target. */
export async function loadTargetOverview(
  sessionId: string,
  signal: AbortSignal,
  t: Translate = fallbackText,
): Promise<IdeTargetOverview> {
  const response = await fetch(`${TARGET_OVERVIEW_URL}?session=${encodeURIComponent(sessionId)}`, {
    signal,
    headers: { accept: "application/json" },
    credentials: "same-origin",
  });
  const payload = await readPayload(response);
  if (!response.ok) throw new Error(failureText(payload, t("error.list")));
  const overview = parseTargetOverview(payload);
  if (!overview) throw new Error(t("error.payload"));
  return overview;
}

/** Apply one popup row to this session and reject with the host's explanation. */
export async function applyTargetChoice(
  sessionId: string,
  optionId: string,
  t: Translate = fallbackText,
): Promise<void> {
  const target =
    optionId === AUTO_TARGET_ID
      ? { kind: "auto" }
      : optionId === OFF_TARGET_ID
        ? { kind: "off" }
        : { kind: "manual", ideId: optionId };
  const response = await fetch(`${TARGET_SELECT_URL}?session=${encodeURIComponent(sessionId)}`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(target),
  });
  const payload = await readPayload(response);
  if (!response.ok) throw new Error(failureText(payload, t("error.choice")));
}

/**
 * Project one overview onto the shared popup rows: reachable IDEs first, then the
 * session's automatic and disabled modes, with the row in use marked active.
 */
export function targetOptions(overview: IdeTargetOverview, t: Translate): SelectOption[] {
  const rows: SelectOption[] = overview.ides.map((ide) => ({
    id: ide.id,
    label: ide.name,
    detail: t("ide.detail", {
      workspace: workspaceText(ide, t),
      host: ide.host,
      port: String(ide.port),
    }),
    group: { name: "ides", label: t("group.ides") },
    ...(overview.selection.kind === "manual" && overview.selection.ideId === ide.id
      ? { active: true }
      : {}),
  }));
  const automatic = automaticRow(overview);
  rows.push({
    id: AUTO_TARGET_ID,
    label: t("auto.label"),
    detail:
      automatic === undefined
        ? t("auto.none")
        : t("auto.target", { name: automatic.name, workspace: workspaceText(automatic, t) }),
    group: { name: "mode", label: t("group.mode") },
    ...(overview.selection.kind === "auto" ? { active: true } : {}),
  });
  rows.push({
    id: OFF_TARGET_ID,
    label: t("off.label"),
    detail: t("off.detail"),
    group: { name: "mode", label: t("group.mode") },
    ...(overview.selection.kind === "off" ? { active: true } : {}),
  });
  return rows;
}

/** Resolve the translator, preferring the mounted locale service. */
export function resolveTranslate(text: Translate | undefined): Translate {
  return text ?? fallbackText;
}

function automaticRow(overview: IdeTargetOverview): IdeTargetRow | undefined {
  if (overview.automaticId === undefined) return undefined;
  return overview.ides.find((ide) => ide.id === overview.automaticId);
}

function workspaceText(ide: IdeTargetRow, t: Translate): string {
  return ide.workspaceFolders.join(", ") || t("workspace.unknown");
}

async function readPayload(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

function failureText(payload: unknown, context: string): string {
  if (typeof payload === "object" && payload !== null && "error" in payload) {
    const { error } = payload as { error?: unknown };
    if (typeof error === "string" && error.length > 0) return error;
  }
  return context;
}
