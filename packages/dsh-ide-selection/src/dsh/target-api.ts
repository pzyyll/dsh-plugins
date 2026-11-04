// ABOUTME: Serve the browser IDE picker's target list and selection over authenticated HTTP.
// ABOUTME: Resolve the workspace and current choice on the host and never trust browser paths.
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Context } from "@deepseek-ai/cordis";
import type {} from "@deepseek-ai/dsh-host-webserver";
import type {} from "@deepseek-ai/dsh-client-connection";
import { SessionId } from "@deepseek-ai/dsh-session";
import {
  parseSelectionTarget,
  toTargetRow,
  type IdeSelectionTarget,
  type IdeTargetOverview,
} from "../shared/target.js";
import type { IdeConnections } from "./ide-connections.js";

export const TARGET_OVERVIEW_PATH = "/ide-selection/targets";
export const TARGET_SELECT_PATH = "/ide-selection/target";

const MAX_REQUEST_BYTES = 8 * 1024;

/** Host operations one target request needs, injected for direct handler tests. */
export interface TargetApiDependencies {
  authorize: (request: IncomingMessage) => 401 | 403 | undefined;
  sessionCwd: (sessionId: string) => string | undefined;
  overview: (sessionId: string, cwd: string, signal: AbortSignal) => Promise<IdeTargetOverview>;
  select: (
    sessionId: string,
    target: IdeSelectionTarget,
    cwd: string,
    signal: AbortSignal,
  ) => Promise<TargetSelectionResult>;
  signal?: AbortSignal;
}

/** One applied choice, or the reason the browser must keep its previous one. */
export type TargetSelectionResult =
  | { readonly ok: true; readonly selection: IdeSelectionTarget }
  | { readonly ok: false; readonly status: 409; readonly error: string };

/** Answer one overview request with the reachable IDEs and the session's current target. */
export async function handleTargetOverview(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: TargetApiDependencies,
): Promise<void> {
  if (request.method !== "GET") {
    response.writeHead(405, { allow: "GET" }).end();
    return;
  }
  const rejection = dependencies.authorize(request);
  if (rejection) {
    response.writeHead(rejection).end();
    return;
  }
  const sessionId = sessionOf(request);
  if (!sessionId) {
    writeJson(response, 400, { error: "a session query parameter is required" });
    return;
  }
  const cwd = dependencies.sessionCwd(sessionId);
  if (!cwd) {
    writeJson(response, 404, { error: "this session is closed or has no workspace directory" });
    return;
  }
  const signal = requestSignal(response, dependencies.signal);
  try {
    const overview = await dependencies.overview(sessionId, cwd, signal);
    if (!signal.aborted) writeJson(response, 200, overview);
  } catch (cause) {
    if (!signal.aborted) writeJson(response, 500, { error: errorMessage(cause) });
  }
}

/** Apply one selected target and answer with the choice the session now carries. */
export async function handleTargetSelect(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: TargetApiDependencies,
): Promise<void> {
  if (request.method !== "POST") {
    response.writeHead(405, { allow: "POST" }).end();
    return;
  }
  const rejection = dependencies.authorize(request);
  if (rejection) {
    response.writeHead(rejection).end();
    return;
  }
  const sessionId = sessionOf(request);
  if (!sessionId) {
    writeJson(response, 400, { error: "a session query parameter is required" });
    return;
  }
  const cwd = dependencies.sessionCwd(sessionId);
  if (!cwd) {
    writeJson(response, 404, { error: "this session is closed or has no workspace directory" });
    return;
  }
  let body: unknown;
  try {
    body = await readJsonBody(request);
  } catch (cause) {
    writeJson(response, 400, { error: errorMessage(cause) });
    return;
  }
  const target = parseSelectionTarget(body);
  if (!target) {
    writeJson(response, 400, { error: "expected an auto, off, or manual IDE target" });
    return;
  }
  const signal = requestSignal(response, dependencies.signal);
  try {
    const result = await dependencies.select(sessionId, target, cwd, signal);
    if (signal.aborted) return;
    if (result.ok) writeJson(response, 200, { selection: result.selection });
    else writeJson(response, result.status, { error: result.error });
  } catch (cause) {
    if (!signal.aborted) writeJson(response, 500, { error: errorMessage(cause) });
  }
}

/** Register both target routes while the web server and connection services exist. */
export function registerTargetApi(
  ctx: Context,
  options: { connections: IdeConnections; signal: AbortSignal },
): void {
  ctx.inject(["webServer", "connection", "sessions"], (scope) => {
    const { connections } = options;
    const controller = new AbortController();
    const signal = AbortSignal.any([options.signal, controller.signal]);
    const dependencies: TargetApiDependencies = {
      authorize: (request) => scope.connection.requestRejection({ headers: request.headers }),
      sessionCwd: (sessionId) => scope.sessions.get(SessionId(sessionId))?.header.cwd,
      overview: async (sessionId, cwd, requestAbort) => {
        const targets = await connections.listTargets(cwd, requestAbort);
        const overview: IdeTargetOverview = {
          selection: connections.getTarget(SessionId(sessionId)),
          ides: targets.ides.map(toTargetRow),
        };
        return targets.automaticId === undefined
          ? overview
          : { ...overview, automaticId: targets.automaticId };
      },
      select: (sessionId, target, cwd, requestAbort) =>
        applyTarget(connections, SessionId(sessionId), target, cwd, requestAbort),
      signal,
    };
    const disposeOverview = scope.webServer.register({
      kind: "exact",
      path: TARGET_OVERVIEW_PATH,
      handler: (request, response) => handleTargetOverview(request, response, dependencies),
    });
    const disposeSelect = scope.webServer.register({
      kind: "exact",
      path: TARGET_SELECT_PATH,
      handler: (request, response) => handleTargetSelect(request, response, dependencies),
    });
    scope.effect(() => () => {
      controller.abort();
      disposeOverview();
      disposeSelect();
    });
  });
}

async function applyTarget(
  connections: IdeConnections,
  sessionId: SessionId,
  target: IdeSelectionTarget,
  cwd: string,
  signal: AbortSignal,
): Promise<TargetSelectionResult> {
  if (target.kind !== "manual") {
    connections.setMode(sessionId, target.kind);
    return { ok: true, selection: connections.getTarget(sessionId) };
  }
  const selected = await connections.select(sessionId, target.ideId, cwd, signal);
  if (!selected) {
    return {
      ok: false,
      status: 409,
      error:
        "that IDE is no longer reachable or does not match this workspace; the previous choice was kept",
    };
  }
  return { ok: true, selection: { kind: "manual", ideId: selected.id } };
}

function sessionOf(request: IncomingMessage): string | undefined {
  const sessionId = new URL(request.url ?? "/", "http://127.0.0.1").searchParams.get("session");
  return sessionId ? sessionId : undefined;
}

/** Abort the work when the browser drops the response or the plugin unloads. */
function requestSignal(response: ServerResponse, lifetime?: AbortSignal): AbortSignal {
  const controller = new AbortController();
  response.once("close", () => controller.abort());
  return lifetime ? AbortSignal.any([controller.signal, lifetime]) : controller.signal;
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string);
    total += buffer.length;
    if (total > MAX_REQUEST_BYTES) throw new Error("the request body is too large");
    chunks.push(buffer);
  }
  if (total === 0) return undefined;
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch {
    throw new Error("the request body is not valid JSON");
  }
}

function writeJson(response: ServerResponse, status: number, body: unknown): void {
  if (response.writableEnded || response.destroyed) return;
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(`${JSON.stringify(body)}\n`);
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
