// ABOUTME: Declare the client command surface this plugin decorates without importing the shell bundle.
// ABOUTME: Keep the contract to the popupSelect fields the IDE picker uses.

/** One option row of the shared popupSelect shell. */
export interface SelectOption {
  readonly id: string;
  readonly label: string;
  readonly detail?: string;
  readonly group?: { readonly name: string; readonly label: string };
  readonly active?: boolean;
}

/** The session projection every command callback receives. */
export interface CommandSession {
  readonly sessionId: string;
}

/** Registered popup behavior for one command name. */
export interface PopupSelectSpec {
  readonly kind: "popupSelect";
  options(session: CommandSession, signal: AbortSignal): Promise<readonly SelectOption[]>;
  onSelect(option: SelectOption, session: CommandSession): void | Promise<void>;
}

/** The `ctx.commandUi` face this plugin uses. */
export interface CommandUiContract {
  decorate(decoration: {
    readonly name: string;
    available(session: CommandSession): boolean;
    readonly ui: PopupSelectSpec;
  }): () => void;
}
