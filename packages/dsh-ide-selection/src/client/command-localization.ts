// ABOUTME: Localize the select-ide description in the host command catalog.
// ABOUTME: Read the active locale when the menu uses a cached command descriptor.

const SELECT_IDE_COMMAND = "select-ide";
const LOCALIZED_LIST = Symbol.for("dsh-ide-selection.command-list");

interface CommandRow {
  readonly name: string;
}

interface CommandListSuccess {
  ok: true;
  value: readonly CommandRow[];
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
  const wrapped: CommandListMethod = async (sessionId) => {
    const result = await original(sessionId);
    if (!isCommandListSuccess(result)) return result;
    return {
      ...result,
      value: result.value.map((command) =>
        command.name !== SELECT_IDE_COMMAND
          ? command
          : {
              ...command,
              // Read the active language even when the host catalog is cached.
              get description() {
                return description();
              },
            },
      ),
    };
  };
  wrapped[LOCALIZED_LIST] = true;
  commands.list = wrapped;
}

function isCommandListSuccess(result: unknown): result is CommandListSuccess {
  if (typeof result !== "object" || result === null || !("ok" in result) || !("value" in result))
    return false;
  const value = (result as { ok?: unknown; value?: unknown }).value;
  return (result as { ok?: unknown }).ok === true && Array.isArray(value);
}
