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
import { statusButtonText } from "./status-label.js";
import { IdeStatusControl, STATUS_ORDER, STATUS_PILL_CSS } from "./status-picker.js";
const STATUS_STYLE_ID = "dsh-ide-selection-status";
const SELECT_IDE_COMMAND = "select-ide";

interface StyleRoot {
  getElementById(id: string): unknown;
  createElement(tag: "style"): { id: string; textContent: string };
  head: { appendChild(node: unknown): void };
}

function installStatusStyle(): void {
  const root = (globalThis as { document?: StyleRoot }).document;
  if (!root || root.getElementById(STATUS_STYLE_ID)) return;
  const style = root.createElement("style");
  style.id = STATUS_STYLE_ID;
  style.textContent = STATUS_PILL_CSS;
  root.head.appendChild(style);
}

interface SelectionStatusEvent {
  connected: boolean;
  text?: string;
  lines?: number;
  detail?: string;
}

interface StatusStream {
  onmessage: ((event: { data: string }) => void) | null;
  onerror: (() => void) | null;
  close: () => void;
}

function openStatusStream(sessionId: string): StatusStream {
  const browser = globalThis as { EventSource?: new (url: string) => StatusStream };
  if (!browser.EventSource) throw new Error("EventSource is unavailable");
  return new browser.EventSource(`/ide-selection/events?session=${encodeURIComponent(sessionId)}`);
}

function isStatusEvent(value: unknown): value is SelectionStatusEvent {
  if (typeof value !== "object" || value === null || !("connected" in value)) return false;
  const event = value as {
    connected?: unknown;
    text?: unknown;
    lines?: unknown;
    detail?: unknown;
  };
  const lines =
    event.lines === undefined ||
    (typeof event.lines === "number" && Number.isSafeInteger(event.lines) && event.lines >= 0);
  return (
    lines &&
    (event.connected === false ||
      (event.connected === true &&
        typeof event.text === "string" &&
        (event.detail === undefined || typeof event.detail === "string")))
  );
}

/** Composer or Hero pill for the session's current VS Code selection. */
export function SelectionStatus({ sessionId }: { sessionId?: string }): ReactElement {
  const [status, setStatus] = useState<
    { sessionId: string; event: SelectionStatusEvent } | undefined
  >(undefined);
  const [localeRevision, setLocaleRevision] = useState(0);
  useLayoutEffect(() => {
    installStatusStyle();
  }, []);
  useEffect(() => {
    const locale = clientContext?.get("locale") as LocaleService | undefined;
    return locale?.subscribe?.(() => setLocaleRevision((revision) => revision + 1));
  }, []);
  useEffect(() => {
    if (!sessionId) return undefined;
    const stream = openStatusStream(sessionId);
    stream.onerror = () => setStatus({ sessionId, event: { connected: false } });
    stream.onmessage = (message) => {
      try {
        const parsed: unknown = JSON.parse(message.data);
        if (isStatusEvent(parsed)) setStatus({ sessionId, event: parsed });
      } catch {
        // Ignore a malformed event and keep the last accepted status.
      }
    };
    return () => {
      stream.onmessage = null;
      stream.onerror = null;
      stream.close();
    };
  }, [sessionId]);
  const t = useMemo(() => translateAt(localeRevision), [localeRevision]);
  const event = status?.sessionId === sessionId ? status?.event : undefined;
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

interface ClientSlots {
  inject: (name: string, register: () => () => void) => void;
  register: (
    options: { name: string; id: string; order: number },
    component: (props: { sessionId?: string }) => ReactElement | null,
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
