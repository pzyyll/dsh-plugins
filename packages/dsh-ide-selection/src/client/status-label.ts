// ABOUTME: Format the IDE status label in the active UI language.
// ABOUTME: Preserve the original icon for connected and disconnected states.
import type { Translate } from "./targets.js";

const STATUS_ICON = "⧉";

/** One status event the composer pill can label. */
export interface StatusLabelEvent {
  readonly connected?: boolean;
  readonly lines?: number;
  readonly text?: string;
}

/** Always show the icon; connected events can add localized selection text. */
export function statusButtonText(event: StatusLabelEvent | undefined, t: Translate): string {
  if (!event || event.connected === false) return STATUS_ICON;
  if (typeof event.lines !== "number") return event.text || STATUS_ICON;
  if (event.lines <= 0) return STATUS_ICON;
  if (event.lines === 1) return STATUS_ICON + " " + t("status.selected");
  return STATUS_ICON + " " + t("status.lines", { count: event.lines });
}
