// ABOUTME: Dispatch diagnostic actions from the shared IDE stream to the composer or session.
// ABOUTME: Validate event bounds and preserve refused text for an explicit retry.
import { MAX_DIAGNOSTIC_PAYLOAD_CHARS } from "../shared/diagnostics.js";
import { subscribeIdeEvents, type SubscribeIdeEvents } from "./ide-stream.js";
import { selectionReferenceFromEvent } from "../shared/selection-reference.js";
import type { InsertSelectionReference } from "./selection-references.js";

export const MAX_FORMATTED_DIAGNOSTIC_CHARS = 2 * MAX_DIAGNOSTIC_PAYLOAD_CHARS;

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

export type SendDiagnosticFix = (
  sessionId: string,
  text: string,
  signal: AbortSignal,
) => Promise<void>;
export type DiagnosticFallback = (
  text: string,
  retry: () => boolean,
  metadata?: { action: "fix"; error: string },
) => void;

function diagnosticText(
  value: unknown,
): { action: "send-diagnostic" | "fix" | undefined; text: string } | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const event = value as { type?: unknown; action?: unknown; text?: unknown };
  if (event.type === "ready") return undefined;
  if (
    event.type !== "diagnostic" ||
    typeof event.text !== "string" ||
    event.text.length === 0 ||
    event.text.length > MAX_FORMATTED_DIAGNOSTIC_CHARS
  )
    return undefined;
  if (event.action !== undefined && event.action !== "send-diagnostic" && event.action !== "fix")
    return undefined;
  return { action: event.action as "send-diagnostic" | "fix" | undefined, text: event.text };
}

/** Bind one session's SSE stream; returned cleanup invalidates callbacks before closing. */
export function bindDiagnosticInput(
  sessionId: string,
  inputActions: InputActions,
  onFallback: DiagnosticFallback,
  sendFix?: SendDiagnosticFix,
  subscribe: SubscribeIdeEvents = subscribeIdeEvents,
  insertSelection?: InsertSelectionReference,
): () => void {
  let active = true;
  const abortController = new AbortController();
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
  const unsubscribe = subscribe(sessionId, "diagnostic", (event) => {
    if (!active) return;
    let text: string | undefined;
    try {
      const parsed = diagnosticText(event);
      if (parsed) {
        if (parsed.action === "fix") {
          if (!sendFix) return;
          void Promise.resolve()
            .then(() => {
              if (!active) return;
              return sendFix(sessionId, parsed.text, abortController.signal);
            })
            .then(
              () => {},
              (error: unknown) => {
                if (!active) return;
                const messageText = error instanceof Error ? error.message : String(error);
                onFallback(parsed.text, () => insert(parsed.text), {
                  action: "fix",
                  error: messageText,
                });
              },
            );
          return;
        }
        text = parsed.text;
      }
    } catch {
      // Ignore malformed host events; do not alter the draft.
      return;
    }
    if (text === undefined || insert(text)) return;
    onFallback(text, () => insert(text));
  });
  const unsubscribeSelection = subscribe(sessionId, "selection", (value) => {
    if (!active) return;
    const reference = selectionReferenceFromEvent(value);
    if (!reference) return;
    const retry = (): boolean => {
      if (!active || !insertSelection) return false;
      try {
        if (!insertSelection(sessionId, reference, inputActions.captureInsertion())) return false;
      } catch {
        return false;
      }
      try {
        inputActions.persistDraft();
      } catch {
        // Insertion succeeded. A second attempt would duplicate the reference.
      }
      return true;
    };
    if (!retry()) onFallback(reference.clipboardText, retry);
  });
  return () => {
    if (!active) return;
    active = false;
    abortController.abort();
    unsubscribeSelection();
    unsubscribe();
  };
}
