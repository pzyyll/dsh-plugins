// ABOUTME: Stream connected IDE selection status to one browser session.
// ABOUTME: Share watches by workspace and IDE target without sending selected text.
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Context } from "@deepseek-ai/cordis";
import type {} from "@deepseek-ai/dsh-host-webserver";
import type {} from "@deepseek-ai/dsh-client-connection";
import { SessionId } from "@deepseek-ai/dsh-session";
import { selectionStatusText } from "../shared/status.js";
import { followSelection, type FollowUpdate } from "../shared/watch.js";
import type { IdeConnections } from "./ide-connections.js";

export const SELECTION_EVENTS_PATH = "/ide-selection/events";

export type SelectionStatusEvent =
  | { connected: false }
  | { connected: true; text: string; lines: number; detail?: string };

export interface SelectionHubOptions {
  lockDir: string;
  maxAgeMs: number;
  signal: AbortSignal;
}

/** Fan out one live IDE watch to every browser subscribed to the same workspace. */
export class SelectionHub {
  private readonly groups = new Map<string, SelectionGroup>();

  constructor(private readonly options: SelectionHubOptions) {
    options.signal.addEventListener(
      "abort",
      () => {
        for (const group of this.groups.values()) group.stop();
        this.groups.clear();
      },
      { once: true },
    );
  }

  subscribe(
    cwd: string,
    listener: (event: SelectionStatusEvent) => void,
    ideId?: string,
  ): () => void {
    if (this.options.signal.aborted) return () => undefined;
    const key = JSON.stringify([cwd, ideId]);
    let group = this.groups.get(key);
    if (!group) {
      group = new SelectionGroup(cwd, this.options, () => this.groups.delete(key), ideId);
      this.groups.set(key, group);
    }
    return group.add(listener);
  }

  subscribeSession(
    sessionId: SessionId,
    cwd: string,
    connections: IdeConnections,
    listener: (event: SelectionStatusEvent) => void,
  ): () => void {
    let stopWatch = () => {};
    const stopTarget = connections.subscribe(sessionId, (target) => {
      stopWatch();
      listener({ connected: false });
      stopWatch =
        target.kind === "off"
          ? () => {}
          : this.subscribe(cwd, listener, target.kind === "manual" ? target.ideId : undefined);
    });
    return () => {
      stopTarget();
      stopWatch();
    };
  }
}

class SelectionGroup {
  private readonly listeners = new Set<(event: SelectionStatusEvent) => void>();
  private readonly controller = new AbortController();
  private current: SelectionStatusEvent = { connected: false };

  constructor(
    cwd: string,
    options: SelectionHubOptions,
    private readonly onEmpty: () => void,
    ideId?: string,
  ) {
    followSelection({
      cwd,
      ...(ideId === undefined ? {} : { ideId }),
      lockDir: options.lockDir,
      maxAgeMs: options.maxAgeMs,
      signal: options.signal.aborted
        ? AbortSignal.abort()
        : AbortSignal.any([options.signal, this.controller.signal]),
      onUpdate: (update) => this.publish(statusFromUpdate(update)),
    });
  }

  add(listener: (event: SelectionStatusEvent) => void): () => void {
    this.listeners.add(listener);
    listener(this.current);
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) this.stop();
    };
  }

  stop(): void {
    this.controller.abort();
    this.listeners.clear();
    this.onEmpty();
  }

  private publish(event: SelectionStatusEvent): void {
    if (JSON.stringify(event) === JSON.stringify(this.current)) return;
    this.current = event;
    for (const listener of this.listeners) listener(event);
  }
}

export function statusFromUpdate(update: FollowUpdate): SelectionStatusEvent {
  if (update.type === "disconnected") return { connected: false };
  const status = selectionStatusText(update.type === "cleared" ? undefined : update.snapshot);
  return {
    connected: true,
    text: status.text,
    lines: status.lines,
    ...(status.detail ? { detail: status.detail } : {}),
  };
}

export interface SelectionStreamDependencies {
  authorize: (request: IncomingMessage) => 401 | 403 | undefined;
  subscribe: (sessionId: string, listener: (event: SelectionStatusEvent) => void) => () => void;
  signal?: AbortSignal;
}

/** Publish the session's workspace selection while the web server is available. */
export function registerSelectionStatus(
  ctx: Context,
  options: SelectionHubOptions & { connections: IdeConnections },
): void {
  ctx.inject(["webServer", "connection", "sessions"], (scope) => {
    const { webServer, connection } = scope;
    const controller = new AbortController();
    const signal = AbortSignal.any([options.signal, controller.signal]);
    const hub = new SelectionHub({ ...options, signal });
    const dispose = webServer.register({
      kind: "exact",
      path: SELECTION_EVENTS_PATH,
      handler: (request, response) =>
        handleSelectionStream(request, response, {
          authorize: (incoming) => connection.requestRejection({ headers: incoming.headers }),
          subscribe: (sessionId, listener) => {
            const cwd = scope.sessions.get(SessionId(sessionId))?.header.cwd;
            if (!cwd) {
              listener({ connected: false });
              return () => undefined;
            }
            return hub.subscribeSession(SessionId(sessionId), cwd, options.connections, listener);
          },
          signal,
        }),
    });
    scope.effect(() => () => {
      controller.abort();
      dispose();
    });
  });
}

/** Write `text/event-stream` updates for `?session=<id>` after authorization. */
export function handleSelectionStream(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: SelectionStreamDependencies,
): void {
  const rejection = dependencies.authorize(request);
  if (rejection) {
    response.writeHead(rejection).end();
    return;
  }
  const sessionId = new URL(request.url ?? "/", "http://127.0.0.1").searchParams.get("session");
  if (!sessionId) {
    response.writeHead(400).end();
    return;
  }
  if (dependencies.signal?.aborted) {
    response.writeHead(503).end();
    return;
  }
  response.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache, no-transform",
    connection: "keep-alive",
  });
  const unsubscribe = dependencies.subscribe(sessionId, (event) => {
    response.write(`data: ${JSON.stringify(event)}\n\n`);
  });
  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    dependencies.signal?.removeEventListener("abort", close);
    unsubscribe();
  };
  const close = () => {
    stop();
    response.end();
  };
  response.on("close", stop);
  dependencies.signal?.addEventListener("abort", close, { once: true });
  if (dependencies.signal?.aborted) close();
}
