// ABOUTME: Show the live IDE connection in the dsh composer status dock.
// ABOUTME: Render host-provided text and reveal the file and range only on hover.
import { createElement, useEffect, useState, type CSSProperties, type ReactElement } from "react";
import { Tooltip } from "@deepseek-ai/dsh-client-ui-primitives";

/** Same hover delay as the composer context meter. */
const TOOLTIP_DELAY_MS = 200;
const PILL_STYLE: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  maxWidth: "100%",
  padding: "1px 8px",
  color: "var(--dsw-alias-label-tertiary)",
  font: "inherit",
  fontVariantNumeric: "tabular-nums",
  whiteSpace: "nowrap",
};

interface SelectionStatusEvent {
  connected: boolean;
  text?: string;
  detail?: string;
}

interface StatusStream {
  onmessage: ((event: { data: string }) => void) | null;
  close: () => void;
}

function openStatusStream(sessionId: string): StatusStream {
  const browser = globalThis as { EventSource?: new (url: string) => StatusStream };
  if (!browser.EventSource) throw new Error("EventSource is unavailable");
  return new browser.EventSource(`/ide-selection/events?session=${encodeURIComponent(sessionId)}`);
}

function isStatusEvent(value: unknown): value is SelectionStatusEvent {
  if (typeof value !== "object" || value === null || !("connected" in value)) return false;
  const event = value as { connected?: unknown; text?: unknown; detail?: unknown };
  return (
    event.connected === false ||
    (event.connected === true &&
      typeof event.text === "string" &&
      (event.detail === undefined || typeof event.detail === "string"))
  );
}

/** Composer pill for the session's current VS Code selection. */
export function SelectionStatus({ sessionId }: { sessionId?: string }): ReactElement | null {
  const [event, setEvent] = useState<SelectionStatusEvent | undefined>(undefined);
  useEffect(() => {
    if (!sessionId) return undefined;
    const stream = openStatusStream(sessionId);
    stream.onmessage = (message) => {
      try {
        const parsed: unknown = JSON.parse(message.data);
        if (isStatusEvent(parsed)) setEvent(parsed);
      } catch {
        // Ignore a malformed event and keep the last accepted status.
      }
    };
    return () => stream.close();
  }, [sessionId]);
  if (!event?.connected || !event.text) return null;
  const pill = createElement(
    "span",
    { "data-composer-stat": "ide-selection", style: PILL_STYLE },
    event.text,
  );
  if (event.detail === undefined) return pill;
  return createElement(
    Tooltip,
    { label: event.detail, side: "top", delayMs: TOOLTIP_DELAY_MS, portal: true },
    pill,
  );
}

interface ClientSlots {
  inject: (name: string, register: () => () => void) => void;
  register: (
    options: { name: string; id: string; order: number },
    component: (props: { sessionId?: string }) => ReactElement | null,
  ) => () => void;
}

export const inject = ["slots"];

/** Register the IDE status pill after the built-in composer statistics. */
export function apply(ctx: { slots: ClientSlots }): void {
  ctx.slots.inject("conversation.composer.dock", () =>
    ctx.slots.register(
      {
        name: "conversation.composer.dock",
        id: "ide-selection",
        order: 2,
      },
      SelectionStatus,
    ),
  );
}
