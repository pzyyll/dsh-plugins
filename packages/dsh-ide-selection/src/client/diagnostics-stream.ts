// ABOUTME: Bind the diagnostics SSE wire stream to the composer's insertion API.
// ABOUTME: Validate event bounds and preserve refused text for an explicit retry.
import { MAX_DIAGNOSTIC_PAYLOAD_CHARS } from "../shared/diagnostics.js";

export const MAX_FORMATTED_DIAGNOSTIC_CHARS = 2 * MAX_DIAGNOSTIC_PAYLOAD_CHARS;
export const DIAGNOSTICS_STREAM_URL = "/ide-selection/diagnostics";

export interface InsertionSpan {
  start: number;
  end: number;
  draftRev: number;
}

export interface InputActions {
  captureInsertion(): InsertionSpan;
  insertText(text: string, span: InsertionSpan): boolean;
  persistDraft(): void;
}

interface DiagnosticEventSource {
  onmessage: ((event: { data: string }) => void) | null;
  onerror: (() => void) | null;
  close(): void;
}

function openDiagnosticStream(sessionId: string): DiagnosticEventSource {
  const browser = globalThis as { EventSource?: new (url: string) => DiagnosticEventSource };
  if (!browser.EventSource) throw new Error("EventSource is unavailable");
  return new browser.EventSource(
    `${DIAGNOSTICS_STREAM_URL}?session=${encodeURIComponent(sessionId)}`,
  );
}

function diagnosticText(value: unknown): string | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const event = value as { type?: unknown; text?: unknown };
  if (event.type === "ready") return undefined;
  if (
    event.type !== "diagnostic" ||
    typeof event.text !== "string" ||
    event.text.length === 0 ||
    event.text.length > MAX_FORMATTED_DIAGNOSTIC_CHARS
  )
    return undefined;
  return event.text;
}

/** Bind one session's SSE stream; returned cleanup invalidates callbacks before closing. */
export function bindDiagnosticInput(
  sessionId: string,
  inputActions: InputActions,
  onFallback: (text: string, retry: () => boolean) => void,
  createStream: (sessionId: string) => DiagnosticEventSource = openDiagnosticStream,
): () => void {
  const stream = createStream(sessionId);
  let active = true;
  const insert = (text: string): boolean => {
    if (!active) return false;
    let inserted: boolean;
    try {
      const span = inputActions.captureInsertion();
      inserted = inputActions.insertText(text, span);
    } catch {
      return false;
    }
    if (!inserted) return false;
    try {
      inputActions.persistDraft();
    } catch {
      // The text is already inserted, so never expose a retry that could duplicate it.
    }
    return true;
  };
  stream.onmessage = (message) => {
    if (!active) return;
    let text: string | undefined;
    try {
      text = diagnosticText(JSON.parse(message.data));
    } catch {
      // Ignore malformed host events; do not alter the draft.
      return;
    }
    if (text === undefined || insert(text)) return;
    onFallback(text, () => insert(text));
  };
  return () => {
    if (!active) return;
    active = false;
    stream.onmessage = null;
    stream.onerror = null;
    stream.close();
  };
}
