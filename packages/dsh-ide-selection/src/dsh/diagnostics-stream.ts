// ABOUTME: Route explicit IDE diagnostic actions to one mounted Web composer.
// ABOUTME: Follow the session's IDE target without storing or replaying diagnostic text.
import type { Context } from "@deepseek-ai/cordis";
import { SessionId } from "@deepseek-ai/dsh-session";
import { formatDiagnosticContext } from "../shared/diagnostics.js";
import { followSelection } from "../shared/watch.js";
import { handleSelectionStream, type SelectionHubOptions } from "./status-stream.js";
import type { IdeConnections } from "./ide-connections.js";

export const DIAGNOSTIC_EVENTS_PATH = "/ide-selection/diagnostics";
export type DiagnosticInputEvent = { type: "ready" } | { type: "diagnostic"; text: string };

/** Register an authenticated, session-addressed stream for manual send actions. */
export function registerDiagnosticInput(
  ctx: Context,
  options: SelectionHubOptions & { connections: IdeConnections },
): void {
  ctx.inject(["webServer", "connection", "sessions"], (scope) => {
    const controller = new AbortController();
    const signal = AbortSignal.any([options.signal, controller.signal]);
    const dispose = scope.webServer.register({
      kind: "exact",
      path: DIAGNOSTIC_EVENTS_PATH,
      handler: (request, response) => {
        if (request.method !== "GET") {
          response.writeHead(405, { allow: "GET" }).end();
          return;
        }
        handleSelectionStream<DiagnosticInputEvent>(request, response, {
          authorize: (incoming) => scope.connection.requestRejection({ headers: incoming.headers }),
          signal,
          subscribe: (id, listener) => {
            listener({ type: "ready" });
            const sessionId = SessionId(id);
            const session = scope.sessions.get(sessionId);
            const cwd = session?.header.cwd;
            if (!cwd || session.header.origin === "subagent") return () => undefined;
            let watch = new AbortController();
            const stopTarget = options.connections.subscribe(sessionId, (target) => {
              watch.abort();
              watch = new AbortController();
              if (target.kind === "off" || signal.aborted) return;
              followSelection({
                cwd,
                lockDir: options.lockDir,
                maxAgeMs: options.maxAgeMs,
                signal: AbortSignal.any([signal, watch.signal]),
                ...(target.kind === "manual" ? { ideId: target.ideId } : {}),
                onUpdate: () => undefined,
                onDiagnostic: (context) =>
                  listener({
                    type: "diagnostic",
                    text: formatDiagnosticContext(context),
                  }),
              });
            });
            const stopSession = scope.on(
              "session/disposed",
              (disposed) => {
                if (disposed.id !== sessionId) return;
                stopTarget();
                watch.abort();
                response.end();
              },
              { global: true },
            );
            return () => {
              stopSession();
              stopTarget();
              watch.abort();
            };
          },
        });
      },
    });
    scope.effect(() => () => {
      controller.abort();
      dispose();
    });
  });
}
