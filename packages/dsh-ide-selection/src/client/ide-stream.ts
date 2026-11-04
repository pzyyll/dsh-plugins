// ABOUTME: Share one browser event stream between IDE status and diagnostic consumers.
// ABOUTME: Dispatch classified events and replay status only, never diagnostic actions.
export const IDE_EVENTS_URL = "/ide-selection/events";

interface EventStream {
  onmessage: ((event: { data: string }) => void) | null;
  onerror: (() => void) | null;
  close(): void;
}
type EventType = "status" | "diagnostic";
interface Subscriber {
  type: EventType;
  event(value: unknown): void;
  error?: () => void;
}
interface SharedStream {
  source: EventStream;
  subscribers: Set<Subscriber>;
  status?: unknown;
}
const streams = new Map<string, SharedStream>();

export type SubscribeIdeEvents = (
  sessionId: string,
  type: EventType,
  listener: (value: unknown) => void,
  onError?: () => void,
) => () => void;

/** Reference-count one EventSource per session and close it when the last consumer leaves. */
export const subscribeIdeEvents: SubscribeIdeEvents = (sessionId, type, listener, onError) => {
  let shared = streams.get(sessionId);
  if (!shared) {
    const browser = globalThis as { EventSource?: new (url: string) => EventStream };
    if (!browser.EventSource) throw new Error("EventSource is unavailable");
    const source = new browser.EventSource(
      `${IDE_EVENTS_URL}?session=${encodeURIComponent(sessionId)}`,
    );
    shared = { source, subscribers: new Set() };
    streams.set(sessionId, shared);
    const current = shared;
    source.onmessage = (message) => {
      let event: unknown;
      try {
        event = JSON.parse(message.data);
      } catch {
        return;
      }
      if (typeof event !== "object" || event === null || !("type" in event)) return;
      if (event.type !== "status" && event.type !== "diagnostic") return;
      if (event.type === "status") current.status = event;
      for (const subscriber of current.subscribers) {
        if (subscriber.type !== event.type) continue;
        subscriber.event(event);
        if (event.type === "diagnostic") break;
      }
    };
    source.onerror = () => {
      current.status = undefined;
      for (const subscriber of current.subscribers) subscriber.error?.();
    };
  }
  const subscriber = { type, event: listener, ...(onError ? { error: onError } : {}) };
  shared.subscribers.add(subscriber);
  if (type === "status" && shared.status !== undefined) listener(shared.status);
  const current = shared;
  let active = true;
  return () => {
    if (!active) return;
    active = false;
    current.subscribers.delete(subscriber);
    if (current.subscribers.size > 0) return;
    current.source.onmessage = null;
    current.source.onerror = null;
    current.source.close();
    if (streams.get(sessionId) === current) streams.delete(sessionId);
  };
};
