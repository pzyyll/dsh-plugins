// ABOUTME: Stream classified IDE status and actions through one authenticated browser connection.
// ABOUTME: Subscribe to the shared Host transport and keep selected text out of status events.
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Context } from "@deepseek-ai/cordis";
import type {} from "@deepseek-ai/dsh-host-webserver";
import type {} from "@deepseek-ai/dsh-client-connection";
import { SessionId } from "@deepseek-ai/dsh-session";
import { selectionStatusText } from "../shared/status.js";
import { formatRangeMention } from "../shared/format.js";
import type { FollowUpdate } from "../shared/watch.js";
import { diagnosticInputEvent, type DiagnosticInputEvent } from "./diagnostics-stream.js";
import type { IdeConnections } from "./ide-connections.js";

export const SELECTION_EVENTS_PATH = "/ide-selection/events";

export type SelectionStatusEvent =
  | { connected: false; disabled?: true }
  | { connected: true; text: string; lines: number; detail?: string };

export type IdeEvent =
  | ({ type: "status" } & SelectionStatusEvent)
  | DiagnosticInputEvent
  | { type: "selection"; text: string };

export interface SelectionHubOptions {
  lockDir: string;
  maxAgeMs: number;
  signal: AbortSignal;
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

export interface SelectionStreamDependencies<Event = SelectionStatusEvent> {
  authorize: (request: IncomingMessage) => 401 | 403 | undefined;
  subscribe: (sessionId: string, listener: (event: Event) => void) => () => void;
  signal?: AbortSignal;
}

/** One stream per mounted session serves both the status pill and diagnostic receiver. */
export function registerSelectionStatus(
  ctx: Context,
  options: SelectionHubOptions & { connections: IdeConnections },
): void {
  ctx.inject(["webServer", "connection", "sessions"], (scope) => {
    const controller = new AbortController();
    const signal = AbortSignal.any([options.signal, controller.signal]);
    const dispose = scope.webServer.register({
      kind: "exact",
      path: SELECTION_EVENTS_PATH,
      handler: (request, response) => {
        if (request.method !== "GET") {
          response.writeHead(405, { allow: "GET" }).end();
          return;
        }
        handleSelectionStream<IdeEvent>(request, response, {
          authorize: (incoming) => scope.connection.requestRejection({ headers: incoming.headers }),
          subscribe: (id, listener) => {
            const sessionId = SessionId(id);
            const session = scope.sessions.get(sessionId);
            const cwd = session?.header.cwd;
            if (!cwd || session.header.origin === "subagent") {
              listener({ type: "status", connected: false });
              return () => undefined;
            }
            const stopWatch = options.connections.watch(
              sessionId,
              cwd,
              (update) => {
                const disabled = options.connections.getTarget(sessionId).kind === "off";
                listener({
                  type: "status",
                  ...(disabled ? { connected: false, disabled: true } : statusFromUpdate(update)),
                });
              },
              (context) => listener(diagnosticInputEvent(context)),
              (snapshot) =>
                listener({ type: "selection", text: `${formatRangeMention(snapshot)}\n` }),
            );
            const stopSession = scope.on(
              "session/disposed",
              (disposed) => {
                if (disposed.id !== sessionId) return;
                stopWatch();
                response.end();
              },
              { global: true },
            );
            return () => {
              stopSession();
              stopWatch();
            };
          },
          signal,
        });
      },
    });
    scope.effect(() => () => {
      controller.abort();
      dispose();
    });
  });
}

/** Write authenticated, session-addressed event updates until the consumer disconnects. */
export function handleSelectionStream<Event = SelectionStatusEvent>(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: SelectionStreamDependencies<Event>,
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
