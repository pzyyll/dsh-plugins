// ABOUTME: Share persistent IDE connections across session status, diagnostic actions, and turns.
// ABOUTME: Route each action to one subscribed session while keeping IDE choices session-local.
import type { SessionId } from "@deepseek-ai/dsh-session";
import { isAbsolute, relative, sep } from "node:path";
import type { IdeTargetList, ReadSelectionOptions } from "../shared/client.js";
import { ideLockId, type AvailableIde } from "../shared/ide.js";
import { discoverLocks, workspaceMatchDistance } from "../shared/lock.js";
import type {
  DiagnosticContext,
  EditorSelectionSnapshot,
  IdeLockFile,
} from "../shared/protocol.js";
import { followSelection, IdeConnectionPool, type FollowUpdate } from "../shared/watch.js";

export type IdeTarget =
  | { readonly kind: "auto" }
  | { readonly kind: "off" }
  | { readonly kind: "manual"; readonly ideId: string };

type TargetListener = (target: IdeTarget) => void;
type ConnectionOptions = Pick<
  ReadSelectionOptions,
  "lockDir" | "timeoutMs" | "maxAgeMs" | "signal"
>;
interface SessionSubscriber {
  update(update: FollowUpdate): void;
  diagnostic?: (context: DiagnosticContext) => void;
}
interface LiveSession {
  cwd: string;
  update: FollowUpdate;
  subscribers: Set<SessionSubscriber>;
  retained: boolean;
  controller: AbortController | undefined;
  ideId: string | undefined;
}
const AUTOMATIC_TARGET: IdeTarget = Object.freeze({ kind: "auto" });
const DISCONNECTED: FollowUpdate = Object.freeze({ type: "disconnected" });

/** One transport pool per plugin; sessions subscribe without opening feature-specific sockets. */
export class IdeConnections {
  private readonly targets = new Map<SessionId, IdeTarget>();
  private readonly listeners = new Map<SessionId, Set<TargetListener>>();
  private readonly pending = new Map<SessionId, symbol>();
  private readonly live = new Map<SessionId, LiveSession>();
  private readonly receivers = new Map<SessionSubscriber, LiveSession>();
  private readonly pool: IdeConnectionPool;

  constructor(private readonly options: ConnectionOptions) {
    this.pool = new IdeConnectionPool(options.signal, (ideId, context) => {
      for (const [receiver, session] of this.receivers) {
        if (session.ideId !== ideId || !inside(session.cwd, context.filePath)) continue;
        receiver.diagnostic?.(context);
        return;
      }
    });
    options.signal.addEventListener(
      "abort",
      () => {
        for (const session of this.live.values()) session.controller?.abort();
        this.live.clear();
        this.receivers.clear();
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

  async list(cwd: string, signal: AbortSignal): Promise<AvailableIde[]> {
    return [...(await this.listTargets(cwd, signal)).ides];
  }

  /** Probe through the same pool, so opening the IDE picker never duplicates a live socket. */
  async listTargets(cwd: string, signal: AbortSignal): Promise<IdeTargetList> {
    const lifetime = AbortSignal.any([signal, this.options.signal]);
    const controller = new AbortController();
    const bounded = AbortSignal.any([lifetime, controller.signal]);
    const timer = setTimeout(() => controller.abort(), this.options.timeoutMs);
    try {
      const locks = await discoverLocks(
        this.options.lockDir,
        cwd,
        this.options.maxAgeMs,
        bounded,
        "all",
      );
      const rows = await Promise.all(
        locks.map(async (lock): Promise<AvailableIde | undefined> => {
          if (!(await this.probe(lock, cwd, bounded))) return undefined;
          return {
            id: ideLockId(lock),
            name: lock.name,
            host: lock.host,
            port: lock.port,
            workspaceFolders: [...lock.workspaceFolders],
            workspaceMatched: Number.isFinite(workspaceMatchDistance(lock, cwd)),
          };
        }),
      );
      const ides = rows.filter((row): row is AvailableIde => row !== undefined);
      const automatic = ides.find((ide) => ide.workspaceMatched);
      return { ides, ...(automatic ? { automaticId: automatic.id } : {}) };
    } finally {
      clearTimeout(timer);
      controller.abort();
    }
  }

  /** Revalidate before committing; an older pending choice cannot replace a newer one. */
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
      const ide = available.find(
        (candidate) => candidate.id === ideId && candidate.workspaceMatched,
      );
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

  /** Read the latest live snapshot. Wait only for the first connection; never open a polling socket. */
  async read(
    sessionId: SessionId,
    cwd: string,
    signal: AbortSignal,
  ): Promise<EditorSelectionSnapshot | undefined> {
    if (signal.aborted || this.options.signal.aborted || this.getTarget(sessionId).kind === "off")
      return undefined;
    const target = this.getTarget(sessionId);
    const session = this.session(sessionId, cwd);
    session.retained = true;
    this.start(sessionId, session);
    if (session.update.type === "selection") return session.update.snapshot;
    if (session.update.type === "cleared") return undefined;
    const lifetime = AbortSignal.any([signal, this.options.signal]);
    return new Promise((resolve) => {
      const finish = (snapshot?: EditorSelectionSnapshot) => {
        clearTimeout(timer);
        lifetime.removeEventListener("abort", aborted);
        session.subscribers.delete(subscriber);
        resolve(snapshot);
      };
      const subscriber: SessionSubscriber = {
        update: (update) => {
          if (this.getTarget(sessionId) !== target || !session.controller || lifetime.aborted)
            finish();
          else if (update.type !== "disconnected")
            finish(update.type === "selection" ? update.snapshot : undefined);
        },
      };
      const aborted = () => finish();
      const timer = setTimeout(() => finish(), this.options.timeoutMs);
      session.subscribers.add(subscriber);
      lifetime.addEventListener("abort", aborted, { once: true });
      if (lifetime.aborted) finish();
    });
  }

  /** Subscribe to both state and actions for one mounted session over the shared connection. */
  watch(
    sessionId: SessionId,
    cwd: string,
    update: SessionSubscriber["update"],
    diagnostic?: SessionSubscriber["diagnostic"],
  ): () => void {
    if (this.options.signal.aborted) return () => undefined;
    const session = this.session(sessionId, cwd);
    const subscriber = { update, ...(diagnostic ? { diagnostic } : {}) };
    session.subscribers.add(subscriber);
    if (diagnostic) this.receivers.set(subscriber, session);
    this.start(sessionId, session);
    update(session.update);
    return () => {
      this.receivers.delete(subscriber);
      session.subscribers.delete(subscriber);
      if (session.subscribers.size === 0 && !session.retained) {
        this.stop(session);
        if (this.live.get(sessionId) === session) this.live.delete(sessionId);
      }
    };
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
    const session = this.live.get(sessionId);
    if (session) {
      this.stop(session);
      for (const subscriber of session.subscribers) this.receivers.delete(subscriber);
    }
    this.live.delete(sessionId);
    this.publish(sessionId, AUTOMATIC_TARGET);
  }

  private session(sessionId: SessionId, cwd: string): LiveSession {
    let session = this.live.get(sessionId);
    if (session && session.cwd !== cwd) {
      this.stop(session);
      session.cwd = cwd;
    }
    if (!session) {
      session = {
        cwd,
        update: DISCONNECTED,
        subscribers: new Set(),
        retained: false,
        controller: undefined,
        ideId: undefined,
      };
      this.live.set(sessionId, session);
    }
    return session;
  }

  private start(sessionId: SessionId, session: LiveSession): void {
    if (session.controller || this.options.signal.aborted) return;
    const target = this.getTarget(sessionId);
    if (target.kind === "off") return;
    const controller = new AbortController();
    session.controller = controller;
    followSelection({
      cwd: session.cwd,
      lockDir: this.options.lockDir,
      maxAgeMs: this.options.maxAgeMs,
      signal: AbortSignal.any([this.options.signal, controller.signal]),
      ...(target.kind === "manual" ? { ideId: target.ideId } : {}),
      pool: this.pool,
      onConnection: (ideId) => {
        if (!controller.signal.aborted) session.ideId = ideId;
      },
      onUpdate: (update) => {
        if (controller.signal.aborted) return;
        session.update = update;
        for (const subscriber of session.subscribers) subscriber.update(update);
      },
    });
  }

  private stop(session: LiveSession): void {
    session.controller?.abort();
    session.controller = undefined;
    session.ideId = undefined;
    session.update = DISCONNECTED;
    for (const subscriber of session.subscribers) subscriber.update(DISCONNECTED);
  }

  private publish(sessionId: SessionId, target: IdeTarget): void {
    if (target.kind === "auto") this.targets.delete(sessionId);
    else this.targets.set(sessionId, target);
    const session = this.live.get(sessionId);
    if (session) {
      this.stop(session);
      this.start(sessionId, session);
    }
    for (const listener of this.listeners.get(sessionId) ?? []) listener(target);
  }

  private probe(lock: IdeLockFile, cwd: string, signal: AbortSignal): Promise<boolean> {
    if (signal.aborted) return Promise.resolve(false);
    const controller = new AbortController();
    const lifetime = AbortSignal.any([signal, controller.signal]);
    return new Promise((resolve) => {
      let settled = false;
      const finish = (available: boolean) => {
        if (settled) return;
        settled = true;
        lifetime.removeEventListener("abort", aborted);
        controller.abort();
        resolve(available);
      };
      const aborted = () => finish(false);
      lifetime.addEventListener("abort", aborted, { once: true });
      void this.pool
        .watch(lock, cwd, lifetime, (update) => {
          if (update.type !== "disconnected") finish(true);
        })
        .then(
          () => finish(false),
          () => finish(false),
        );
      if (lifetime.aborted) finish(false);
    });
  }
}

function inside(base: string, target: string): boolean {
  const path = relative(base, target);
  return path === "" || (path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path));
}
