// ABOUTME: Localize the slash-command description and composer status label.
// ABOUTME: Read the active locale when the UI renders, not when the catalog is cached.

import type { Translate } from "./targets.js";

const SELECT_IDE_COMMAND = "select-ide";
const STATUS_ICON = "\u29c1";
const LOCALIZED_LIST = Symbol.for("dsh-ide-selection.command-list");

interface CommandRow {
  readonly name: string;
}

interface CommandListSuccess {
  ok: true;
  value: readonly CommandRow[];
}

/** One connected status event the composer pill can label. */
export interface StatusLabelEvent {
  readonly lines?: number;
  readonly text?: string;
}

/** Replace `/select-ide`'s catalog sentence with the current UI language. */
export function localizeCommandList<T extends CommandRow>(
  commands: readonly T[],
  description: () => string,
): T[] {
  return commands.map((command) => {
    if (command.name !== SELECT_IDE_COMMAND) return command;
    return {
      ...command,
      get description() {
        return description();
      },
    };
  });
}

/**
 * Translate the command catalog result when the host returns one.
 * The description getter runs again each time the menu reads the cached row.
 */
export function localizeCommandListResult(result: unknown, description: () => string): unknown {
  if (!isCommandListSuccess(result)) return result;
  return { ...result, value: localizeCommandList(result.value, description) };
}

/** Composer label for a connected IDE. Unknown events keep the host text. */
export function statusButtonText(event: StatusLabelEvent, t: Translate): string | undefined {
  if (typeof event.lines !== "number") return event.text;
  if (event.lines <= 0) return STATUS_ICON;
  if (event.lines === 1) return STATUS_ICON + " " + t("status.selected");
  return STATUS_ICON + " " + t("status.lines", { count: event.lines });
}

interface CommandListMethod {
  (sessionId: string): Promise<unknown>;
  [LOCALIZED_LIST]?: true;
}

/** Point one remote command catalog at the live locale. A second call is a no-op. */
export function localizeRemoteCommandList(
  commands: { list?: CommandListMethod },
  description: () => string,
): void {
  const list = commands.list;
  if (!list || list[LOCALIZED_LIST]) return;
  const original = list.bind(commands);
  const wrapped: CommandListMethod = (sessionId) =>
    original(sessionId).then((result) => localizeCommandListResult(result, description));
  wrapped[LOCALIZED_LIST] = true;
  commands.list = wrapped;
}

function isCommandListSuccess(result: unknown): result is CommandListSuccess {
  if (typeof result !== "object" || result === null || !("ok" in result) || !("value" in result))
    return false;
  const value = (result as { ok?: unknown; value?: unknown }).value;
  return (result as { ok?: unknown }).ok === true && Array.isArray(value);
}
