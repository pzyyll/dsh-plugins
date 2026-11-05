// ABOUTME: Display IDE path references as native composer chips without changing sent content.
// ABOUTME: Resolve the addressed session for every edit and serialize the original path mention.
import type { InsertionSpan } from "./diagnostics-stream.js";
import {
  readSelectionContent,
  SELECTION_REFERENCE_SOURCE,
  type SelectionReference,
} from "../shared/selection-reference.js";

export type InsertSelectionReference = (
  sessionId: string,
  reference: SelectionReference,
  span: InsertionSpan,
) => boolean;

/** Structural slices of dsh 0.2.2-rc.1's public input-trigger and session-scope contracts. */
export interface SelectionReferenceSource {
  trigger: "@";
  name: string;
  candidates(): Promise<readonly []>;
  onPick(): undefined;
  codec: {
    clipboardText(ref: string): string;
    serialize(ref: string, signal: AbortSignal): Promise<string>;
  };
}

export interface SelectionInputTriggers {
  registerSource(source: SelectionReferenceSource): () => void;
}

export interface SelectionReferenceSessions {
  scope(sessionId: string):
    | {
        bail(
          event: "slash/input-insert-reference",
          request: { reference: SelectionReference; span: InsertionSpan },
        ): unknown;
      }
    | undefined;
}

/** Keep the source out of completion menus; it owns only references added from the IDE. */
export function selectionReferenceSource(): SelectionReferenceSource {
  return {
    trigger: "@",
    name: SELECTION_REFERENCE_SOURCE,
    candidates: async () => [],
    onPick: () => undefined,
    codec: {
      clipboardText: (ref) => readSelectionContent(ref).mention,
      serialize: async (ref, signal) => {
        signal.throwIfAborted();
        return readSelectionContent(ref).mention;
      },
    },
  };
}

/** Use the guarded public insertion event; never replace the whole draft or submit it. */
export function insertSelectionReference(
  sessions: SelectionReferenceSessions,
  sessionId: string,
  reference: SelectionReference,
  span: InsertionSpan,
): boolean {
  return (
    sessions.scope(sessionId)?.bail("slash/input-insert-reference", { reference, span }) === true
  );
}
