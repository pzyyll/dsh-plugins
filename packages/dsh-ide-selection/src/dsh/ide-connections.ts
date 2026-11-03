// ABOUTME: Keep manual IDE choices local to each live dsh session.
// ABOUTME: Share the chosen target between fresh turn reads and live status watches.
import type { SessionId } from "@deepseek-ai/dsh-session";
import {
  listAvailableIde,
  listIdeTargets,
  readSelection,
  type IdeTargetList,
  type ReadSelectionOptions,
} from "../shared/client.js";
import type { AvailableIde } from "../shared/ide.js";
import type { EditorSelectionSnapshot } from "../shared/protocol.js";

export type IdeTarget =
  | { readonly kind: "auto" }
  | { readonly kind: "off" }
  | { readonly kind: "manual"; readonly ideId: string };

type TargetListener = (target: IdeTarget) => void;
type ConnectionOptions = Pick<
  ReadSelectionOptions,
  "lockDir" | "timeoutMs" | "maxAgeMs" | "signal"
>;
const AUTOMATIC_TARGET: IdeTarget = Object.freeze({ kind: "auto" });

/** Own process-local choices; restart and session disposal restore automatic selection. */
export class IdeConnections {
  private readonly targets = new Map<SessionId, IdeTarget>();
  private readonly listeners = new Map<SessionId, Set<TargetListener>>();
  private readonly pending = new Map<SessionId, symbol>();

  constructor(private readonly options: ConnectionOptions) {
    options.signal.addEventListener(
      "abort",
      () => {
        this.targets.clear();
        this.pending.clear();
        this.listeners.clear();
      },
      { once: true },
    );
  }

  getTarget(sessionId: SessionId): IdeTarget {
    return this.targets.get(sessionId) ?? AUTOMATIC_TARGET;
  }

  list(cwd: string, signal: AbortSignal): Promise<AvailableIde[]> {
    return listAvailableIde(this.readOptions(cwd, signal));
  }

  /** List reachable IDEs together with the workspace-matched automatic target. */
  listTargets(cwd: string, signal: AbortSignal): Promise<IdeTargetList> {
    return listIdeTargets(this.readOptions(cwd, signal));
  }

  /** Revalidate before committing; an older pending selection cannot replace a newer choice. */
  async select(
    sessionId: SessionId,
    ideId: string,
    cwd: string,
    signal: AbortSignal,
  ): Promise<AvailableIde | undefined> {
    const ticket = Symbol("IDE selection");
    this.pending.set(sessionId, ticket);
    try {
      const available = await this.list(cwd, signal);
      if (signal.aborted || this.options.signal.aborted || this.pending.get(sessionId) !== ticket)
        return undefined;
      const ide = available.find((candidate) => candidate.id === ideId);
      if (!ide) return undefined;
      this.publish(sessionId, { kind: "manual", ideId });
      return ide;
    } finally {
      if (this.pending.get(sessionId) === ticket) this.pending.delete(sessionId);
    }
  }

  setMode(sessionId: SessionId, mode: "auto" | "off"): void {
    this.pending.delete(sessionId);
    if (this.options.signal.aborted) return;
    this.publish(sessionId, mode === "auto" ? AUTOMATIC_TARGET : { kind: "off" });
  }

  async read(
    sessionId: SessionId,
    cwd: string,
    signal: AbortSignal,
  ): Promise<EditorSelectionSnapshot | undefined> {
    const target = this.getTarget(sessionId);
    if (target.kind === "off") return undefined;
    const snapshot = await readSelection({
      ...this.readOptions(cwd, signal),
      ...(target.kind === "manual" ? { ideId: target.ideId } : {}),
    });
    return this.getTarget(sessionId) === target ? snapshot : undefined;
  }

  subscribe(sessionId: SessionId, listener: TargetListener): () => void {
    if (this.options.signal.aborted) return () => undefined;
    let listeners = this.listeners.get(sessionId);
    if (!listeners) {
      listeners = new Set();
      this.listeners.set(sessionId, listeners);
    }
    listeners.add(listener);
    listener(this.getTarget(sessionId));
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) this.listeners.delete(sessionId);
    };
  }

  forget(sessionId: SessionId): void {
    this.pending.delete(sessionId);
    this.publish(sessionId, AUTOMATIC_TARGET);
  }

  private publish(sessionId: SessionId, target: IdeTarget): void {
    if (target.kind === "auto") this.targets.delete(sessionId);
    else this.targets.set(sessionId, target);
    for (const listener of this.listeners.get(sessionId) ?? []) listener(target);
  }

  private readOptions(cwd: string, signal: AbortSignal): ReadSelectionOptions {
    return { ...this.options, cwd, signal: AbortSignal.any([this.options.signal, signal]) };
  }
}
