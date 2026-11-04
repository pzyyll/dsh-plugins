// ABOUTME: Format the IDE status label in the active UI language.
// ABOUTME: Hide the icon when integration is off or the plugin status stream is gone.
import type { Translate } from "./targets.js";

const STATUS_ICON = "⧉";

/** One status event the composer pill can label. */
export interface StatusLabelEvent {
  readonly connected?: boolean;
  readonly disabled?: boolean;
  readonly lines?: number;
  readonly text?: string;
}

/**
 * Keep the icon while integration can still be opened, including before an IDE connects.
 * Hide it after this session turns integration off, or when the plugin stream has failed.
 */
export function statusButtonVisible(
  event: StatusLabelEvent | undefined,
  streamFailed = false,
): boolean {
  if (streamFailed) return false;
  return event?.disabled !== true;
}

/** Show the icon; connected events can add localized selection text. */
export function statusButtonText(event: StatusLabelEvent | undefined, t: Translate): string {
  if (!event || event.connected === false) return STATUS_ICON;
  if (typeof event.lines !== "number") return event.text || STATUS_ICON;
  if (event.lines <= 0) return STATUS_ICON;
  if (event.lines === 1) return STATUS_ICON + " " + t("status.selected");
  return STATUS_ICON + " " + t("status.lines", { count: event.lines });
}
