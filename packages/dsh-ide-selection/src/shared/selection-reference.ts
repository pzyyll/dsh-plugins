// ABOUTME: Store only the original IDE path mention inside a persistent display reference.
// ABOUTME: Validate browser events and restore old references without exposing their saved code.
export const SELECTION_REFERENCE_SOURCE = "ide-selection";
const LEGACY_MAX_CONTEXT_CHARS = 64_000;
const MAX_MENTION_CHARS = 8_192;
const MAX_LABEL_CHARS = 1_024;
const MAX_JSON_ESCAPE_CHARS = 6;
// Accept existing draft ids that embedded code, but never return that code to the caller.
export const MAX_SELECTION_REFERENCE_CHARS =
  MAX_JSON_ESCAPE_CHARS * (LEGACY_MAX_CONTEXT_CHARS + MAX_MENTION_CHARS);
const REFERENCE_VERSION = 1;

/** Structural slice of dsh 0.2.2-rc.1's public ReferenceInsert contract. */
export interface SelectionReference {
  source: typeof SELECTION_REFERENCE_SOURCE;
  ref: string;
  label: string;
  appearance: "file";
  clipboardText: string;
}

interface SelectionContent {
  version: typeof REFERENCE_VERSION;
  mention: string;
}

function boundedText(value: unknown, maxChars: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maxChars;
}

/** Restore the path mention; legacy code snapshots have no effect on submitted content. */
export function readSelectionContent(ref: string): SelectionContent {
  if (!boundedText(ref, MAX_SELECTION_REFERENCE_CHARS))
    throw new Error("Invalid IDE selection reference");
  const value: unknown = JSON.parse(ref);
  if (
    typeof value !== "object" ||
    value === null ||
    !("version" in value) ||
    value.version !== REFERENCE_VERSION ||
    !("mention" in value) ||
    !boundedText(value.mention, MAX_MENTION_CHARS)
  )
    throw new Error("Invalid IDE selection reference");
  return { version: REFERENCE_VERSION, mention: value.mention };
}

/** Keep presentation separate from the path mention used for copying and sending. */
export function createSelectionReference(mention: string, label: string): SelectionReference {
  const ref = JSON.stringify({ version: REFERENCE_VERSION, mention });
  readSelectionContent(ref);
  if (!boundedText(label, MAX_LABEL_CHARS)) throw new Error("Invalid IDE selection label");
  return {
    source: SELECTION_REFERENCE_SOURCE,
    ref,
    label,
    appearance: "file",
    clipboardText: mention,
  };
}

/** Admit only a complete selection event with matching persisted and clipboard projections. */
export function selectionReferenceFromEvent(value: unknown): SelectionReference | undefined {
  if (typeof value !== "object" || value === null || !("type" in value)) return undefined;
  if (value.type !== "selection" || !("reference" in value)) return undefined;
  const reference = value.reference;
  if (
    typeof reference !== "object" ||
    reference === null ||
    !("source" in reference) ||
    reference.source !== SELECTION_REFERENCE_SOURCE ||
    !("ref" in reference) ||
    typeof reference.ref !== "string" ||
    !("label" in reference) ||
    !boundedText(reference.label, MAX_LABEL_CHARS) ||
    !("appearance" in reference) ||
    reference.appearance !== "file" ||
    !("clipboardText" in reference)
  )
    return undefined;
  try {
    const content = readSelectionContent(reference.ref);
    if (reference.clipboardText !== content.mention) return undefined;
    return {
      source: SELECTION_REFERENCE_SOURCE,
      ref: reference.ref,
      label: reference.label,
      appearance: "file",
      clipboardText: content.mention,
    };
  } catch {
    return undefined;
  }
}
