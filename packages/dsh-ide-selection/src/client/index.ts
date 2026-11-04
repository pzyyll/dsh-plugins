// ABOUTME: Show the live IDE connection in the dsh composer status dock and blank-session Hero row.
// ABOUTME: Open a compact IDE picker from the status button and keep /select-ide available.
import {
  createElement,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactElement,
} from "react";
import type { CommandUiContract } from "./command-ui.js";
import { LOCALE_NS, en, zh } from "./locales.js";
import {
  applyTargetChoice,
  loadTargetOverview,
  resolveTranslate,
  targetOptions,
  type Translate,
} from "./targets.js";
import { localizeRemoteCommandList } from "./command-localization.js";
import { DiagnosticInput } from "./diagnostics-input.js";
import { subscribeIdeEvents } from "./ide-stream.js";
import type { InputActions } from "./diagnostics-stream.js";
import { sendDiagnosticFix, type DiagnosticFixSessions } from "./diagnostic-fix.js";
import { statusButtonText, statusButtonVisible } from "./status-label.js";
import { IdeStatusControl, STATUS_ORDER, STATUS_PILL_CSS } from "./status-picker.js";
const STATUS_STYLE_ID = "dsh-ide-selection-status";
const SELECT_IDE_COMMAND = "select-ide";

interface StyleElement {
  id: string;
  textContent: string;
  remove(): void;
}

interface StyleRoot {
  getElementById(id: string): StyleElement | null;
  createElement(tag: "style"): StyleElement;
  head: { appendChild(node: unknown): void };
}

let styleUsers = 0;

/** Install the pill stylesheet while at least one status control is mounted. */
function retainStatusStyle(): () => void {
  const root = (globalThis as { document?: StyleRoot }).document;
  if (!root) return () => {};
  styleUsers += 1;
  if (!root.getElementById(STATUS_STYLE_ID)) {
    const style = root.createElement("style");
    style.id = STATUS_STYLE_ID;
    style.textContent = STATUS_PILL_CSS;
    root.head.appendChild(style);
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    styleUsers -= 1;
    if (styleUsers > 0) return;
    styleUsers = 0;
    root.getElementById(STATUS_STYLE_ID)?.remove();
  };
}

interface SelectionStatusEvent {
  connected: boolean;
  disabled?: boolean;
  text?: string;
  lines?: number;
  detail?: string;
}

function isStatusEvent(value: unknown): value is SelectionStatusEvent {
  if (
    typeof value !== "object" ||
    value === null ||
    !("type" in value) ||
    value.type !== "status" ||
    !("connected" in value)
  )
    return false;
  const event = value as {
    connected?: unknown;
    disabled?: unknown;
    text?: unknown;
    lines?: unknown;
    detail?: unknown;
  };
  const disabled =
    event.disabled === undefined || (event.disabled === true && event.connected === false);
  const lines =
    event.lines === undefined ||
    (typeof event.lines === "number" && Number.isSafeInteger(event.lines) && event.lines >= 0);
  return (
    disabled &&
    lines &&
    (event.connected === false ||
      (event.connected === true &&
        typeof event.text === "string" &&
        (event.detail === undefined || typeof event.detail === "string")))
  );
}

/** Composer or Hero pill for the session's current VS Code selection. */
export function SelectionStatus({ sessionId }: { sessionId?: string }): ReactElement | null {
  const [status, setStatus] = useState<
    { sessionId: string; event: SelectionStatusEvent } | undefined
  >(undefined);
  const [failedSessionId, setFailedSessionId] = useState<string | undefined>(undefined);
  const [localeRevision, setLocaleRevision] = useState(0);
  useLayoutEffect(() => retainStatusStyle(), []);
  useEffect(() => {
    const locale = clientContext?.get("locale") as LocaleService | undefined;
    return locale?.subscribe?.(() => setLocaleRevision((revision) => revision + 1));
  }, []);
  useEffect(() => {
    if (!sessionId) return undefined;
    const id = sessionId;
    return subscribeIdeEvents(
      id,
      "status",
      (event) => {
        if (!isStatusEvent(event)) return;
        setFailedSessionId((current) => (current === id ? undefined : current));
        setStatus({ sessionId: id, event });
      },
      () => {
        setFailedSessionId(id);
        setStatus({ sessionId: id, event: { connected: false } });
      },
    );
  }, [sessionId]);
  const t = useMemo(() => translateAt(localeRevision), [localeRevision]);
  const event = status?.sessionId === sessionId ? status?.event : undefined;
  const streamFailed = failedSessionId !== undefined && failedSessionId === sessionId;
  if (!statusButtonVisible(event, streamFailed)) return null;
  const connected = event?.connected === true;
  return createElement(IdeStatusControl, {
    key: sessionId ?? "no-session",
    sessionId,
    connected,
    label: statusButtonText(event, t),
    detail: connected ? (event.detail ?? t("status.connected")) : t("status.disconnected"),
    t,
  });
}

interface SlotComponentProps {
  sessionId?: string;
  inputActions?: InputActions;
  sendFix?: (sessionId: string, text: string, signal: AbortSignal) => Promise<void>;
}

interface ClientSlots {
  inject: (name: string, register: () => () => void) => void;
  register: (
    options: { name: string; id: string; order: number },
    component: (props: SlotComponentProps) => ReactElement | null,
  ) => () => void;
}

/** The commands plugin's locale face, as this bundle uses it. */
interface LocaleService {
  register(namespace: string, locale: string, dictionary: Record<string, string>): () => void;
  bind(namespace: string): Translate;
  subscribe?(listener: () => void): () => void;
}

interface RemoteCommands {
  list?: (sessionId: string) => Promise<unknown>;
}

/** The client context members this bundle relies on. */
interface ClientContext {
  slots: ClientSlots;
  commandUi?: CommandUiContract;
  locale?: LocaleService;
  remote?: { commands?: RemoteCommands };
  get(name: string): unknown;
  effect(callback: () => () => void): void;
  inject(names: readonly string[], callback: (scope: ClientContext) => void): void;
}

let clientContext: ClientContext | undefined;

function activeTranslate(): Translate {
  const locale = clientContext?.get("locale") as LocaleService | undefined;
  return resolveTranslate(locale?.bind(LOCALE_NS));
}

/** Re-read the locale after a snapshot change. The revision forces a new render. */
function translateAt(_revision: number): Translate {
  return activeTranslate();
}

export const inject = ["slots"];

/**
 * The pill's two seats: the resident composer dock, and the blank-session Hero
 * options row, which is the only composer-adjacent seat before the first message.
 */
const STATUS_SLOTS = ["conversation.composer.dock", "conversation.hero.options"] as const;

/** Register the IDE status pill in both seats and the `/select-ide` popup picker. */
export function apply(ctx: ClientContext): void {
  clientContext = ctx;
  for (const name of STATUS_SLOTS) {
    ctx.slots.inject(name, () =>
      ctx.slots.register({ name, id: "ide-selection", order: STATUS_ORDER }, SelectionStatus),
    );
  }
  ctx.inject(["sessions"], (scope) => {
    const sessions = scope.get("sessions") as DiagnosticFixSessions | undefined;
    if (!sessions) return;
    const sendFix = (sessionId: string, text: string, signal: AbortSignal) =>
      sendDiagnosticFix(sessions, sessionId, text, signal);
    // The shared input overlay also mounts in the blank-session Hero; the dock does not.
    scope.slots.inject("conversation.input.overlay", () =>
      scope.slots.register(
        {
          name: "conversation.input.overlay",
          id: "ide-diagnostics-input",
          order: STATUS_ORDER + 1,
        },
        (props) =>
          createElement(DiagnosticInput, {
            ...props,
            sendFix,
            key: props.sessionId,
            t: (key) => activeTranslate()(key),
          }),
      ),
    );
  });
  ctx.inject(["locale"], (scope) => {
    const locale = scope.locale;
    if (!locale) return;
    scope.effect(() => {
      const disposeEn = locale.register(LOCALE_NS, "en", en);
      const disposeZh = locale.register(LOCALE_NS, "zh", zh);
      return () => {
        disposeZh();
        disposeEn();
      };
    });
  });
  ctx.inject(["remote"], (scope) => {
    const commands = scope.remote?.commands;
    if (!commands) return;
    localizeRemoteCommandList(commands, () => activeTranslate()("command.description"));
  });
  ctx.inject(["commandUi"], (scope) => {
    const commandUi = scope.commandUi;
    if (!commandUi) return;
    scope.effect(() =>
      commandUi.decorate({
        name: SELECT_IDE_COMMAND,
        available: () => true,
        ui: {
          kind: "popupSelect",
          options: async (session, signal) => {
            const t = activeTranslate();
            const overview = await loadTargetOverview(session.sessionId, signal, t);
            return targetOptions(overview, t).filter((option) => !option.disabled);
          },
          onSelect: (option, session) => {
            if (option.disabled) return;
            return applyTargetChoice(session.sessionId, option.id, activeTranslate());
          },
        },
      }),
    );
  });
}
