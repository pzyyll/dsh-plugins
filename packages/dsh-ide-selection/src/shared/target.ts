// ABOUTME: Share the IDE target wire vocabulary between the host routes and the browser picker.
// ABOUTME: Validate untrusted payloads with plain guards so both sides enforce one contract.
import type { AvailableIde } from "./ide.js";

/** Row id the browser picker uses for the workspace-matched automatic target. */
export const AUTO_TARGET_ID = "auto";
/** Row id the browser picker uses for disabling IDE integration in this session. */
export const OFF_TARGET_ID = "off";

/** Session-scoped IDE choice, mirroring the host's in-memory target. */
export type IdeSelectionTarget =
  | { readonly kind: "auto" }
  | { readonly kind: "off" }
  | { readonly kind: "manual"; readonly ideId: string };

/** One reachable IDE as the browser picker renders it. */
export interface IdeTargetRow {
  readonly id: string;
  readonly name: string;
  readonly host: string;
  readonly port: number;
  readonly workspaceFolders: readonly string[];
  readonly workspaceMatched: boolean;
}

/** Everything the browser picker needs to open its option list in one response. */
export interface IdeTargetOverview {
  readonly selection: IdeSelectionTarget;
  /** The IDE automatic selection reads for this workspace, when one is reachable. */
  readonly automaticId?: string;
  readonly ides: readonly IdeTargetRow[];
}

/** Project one discovered IDE onto the picker's row shape. */
export function toTargetRow(ide: AvailableIde): IdeTargetRow {
  return {
    id: ide.id,
    name: ide.name,
    host: ide.host,
    port: ide.port,
    workspaceFolders: [...ide.workspaceFolders],
    workspaceMatched: ide.workspaceMatched,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isWorkspaceFolders(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((folder) => typeof folder === "string");
}

/**
 * Read one selection target from untrusted JSON.
 * @param value - parsed request body or stored value.
 * @returns the target, or undefined when the shape is not one this plugin serves.
 */
export function parseSelectionTarget(value: unknown): IdeSelectionTarget | undefined {
  if (!isRecord(value)) return undefined;
  if (value.kind === "auto" || value.kind === "off") return { kind: value.kind };
  if (value.kind !== "manual" || typeof value.ideId !== "string" || value.ideId.length === 0)
    return undefined;
  return { kind: "manual", ideId: value.ideId };
}

function parseTargetRow(value: unknown): IdeTargetRow | undefined {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    value.id.length === 0 ||
    typeof value.name !== "string" ||
    typeof value.host !== "string" ||
    typeof value.port !== "number" ||
    !Number.isSafeInteger(value.port) ||
    !isWorkspaceFolders(value.workspaceFolders) ||
    typeof value.workspaceMatched !== "boolean"
  )
    return undefined;
  return {
    id: value.id,
    name: value.name,
    host: value.host,
    port: value.port,
    workspaceFolders: [...value.workspaceFolders],
    workspaceMatched: value.workspaceMatched,
  };
}

/**
 * Read one overview payload from untrusted JSON.
 * @param value - parsed response body.
 * @returns the overview, or undefined when any row or the selection is malformed.
 */
export function parseTargetOverview(value: unknown): IdeTargetOverview | undefined {
  if (!isRecord(value)) return undefined;
  const selection = parseSelectionTarget(value.selection);
  if (!selection || !Array.isArray(value.ides)) return undefined;
  const ides: IdeTargetRow[] = [];
  for (const entry of value.ides) {
    const row = parseTargetRow(entry);
    if (!row) return undefined;
    ides.push(row);
  }
  const automaticId = value.automaticId;
  if (automaticId === undefined) return { selection, ides };
  if (
    typeof automaticId !== "string" ||
    !ides.some((ide) => ide.id === automaticId && ide.workspaceMatched)
  )
    return undefined;
  return { selection, ides, automaticId };
}
