// ABOUTME: Verify the browser target routes authorize, list, and apply IDE choices over real HTTP.
// ABOUTME: Drive the shipped plugin and WebServer scopes rather than stubbing the transport.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { Context, type Plugin } from "@deepseek-ai/cordis";
import { AgentRegistry } from "@deepseek-ai/dsh-agent";
import { SessionProjectionRegistry } from "@deepseek-ai/dsh-session-projection";
import { WebServer } from "@deepseek-ai/dsh-host-webserver";
import { SessionStore } from "@deepseek-ai/dsh-session";
import { ideLockId } from "../../src/shared/ide.js";
import { createLock, writeLock } from "../../src/shared/lock.js";
import { IdeServer } from "../../src/shared/server.js";
import type { IdeTargetOverview } from "../../src/shared/target.js";
import * as selectionPlugin from "../../src/dsh/index.js";
import { TARGET_OVERVIEW_PATH, TARGET_SELECT_PATH } from "../../src/dsh/target-api.js";

const roots: string[] = [];
const closers: Array<() => Promise<void>> = [];
const servers: IdeServer[] = [];
afterEach(async () => {
  await Promise.all(closers.splice(0).map((close) => close()));
  await Promise.all(servers.splice(0).map((server) => server.stop()));
  await Promise.all(roots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

interface Harness {
  ctx: Context;
  origin: string;
  sessionId: string;
  ideId: string;
  authorize(): void;
  reject(): void;
  url(path: string, sessionId?: string): string;
}

async function createHarness(options: { ideWorkspace?: string } = {}): Promise<Harness> {
  const dir = await mkdtemp(join(tmpdir(), "dsh-target-scope-"));
  roots.push(dir);
  const token = "b".repeat(64);
  const server = new IdeServer(token, () => undefined);
  servers.push(server);
  const port = await server.start();
  const lock = createLock(port, token, [options.ideWorkspace ?? "/work/app"]);
  await writeLock(join(dir, "vscode.lock"), lock);

  const ctx = new Context();
  closers.push(async () => {
    await ctx.fiber.dispose();
  });
  await ctx.plugin(SessionStore);
  await ctx.plugin(SessionProjectionRegistry);
  await ctx.plugin(AgentRegistry);
  await ctx.plugin(WebServer, { host: "127.0.0.1", port: 0 });
  let authorized = false;
  const authorization: Plugin = {
    name: "target-test-authorization",
    apply(scope: Context) {
      scope.provide("connection", {
        requestRejection: () => (authorized ? undefined : 401),
      });
    },
  };
  await ctx.plugin(authorization);
  await ctx.plugin(selectionPlugin, { lockDir: dir });
  const session = ctx.sessions.create(undefined, { meta: { cwd: "/work/app" } });
  const origin = ctx.webServer.getOrigin();
  return {
    ctx,
    origin,
    sessionId: session.id,
    ideId: ideLockId(lock),
    authorize() {
      authorized = true;
    },
    reject() {
      authorized = false;
    },
    url(path, sessionId = session.id) {
      return `${origin}${path}?session=${encodeURIComponent(sessionId)}`;
    },
  };
}

async function overview(harness: Harness) {
  harness.authorize();
  const response = await fetch(harness.url(TARGET_OVERVIEW_PATH));
  expect(response.status).toBe(200);
  return (await response.json()) as IdeTargetOverview;
}

async function select(harness: Harness, body: unknown) {
  harness.authorize();
  return fetch(harness.url(TARGET_SELECT_PATH), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

interface SelectionPayload {
  selection: { kind: string; ideId?: string };
}

async function selectionOf(response: Response): Promise<SelectionPayload["selection"]> {
  return ((await response.json()) as SelectionPayload).selection;
}

describe("IDE target routes", () => {
  it("requires authorization before answering", async () => {
    const harness = await createHarness();
    expect((await fetch(harness.url(TARGET_OVERVIEW_PATH))).status).toBe(401);
    harness.authorize();
    expect((await fetch(harness.url(TARGET_OVERVIEW_PATH))).status).toBe(200);
    harness.reject();
    expect((await fetch(harness.url(TARGET_SELECT_PATH), { method: "POST" })).status).toBe(401);
  });

  it("lists reachable IDEs with the workspace-matched automatic target", async () => {
    const harness = await createHarness();

    const payload = await overview(harness);

    expect(payload.selection).toEqual({ kind: "auto" });
    expect(payload.automaticId).toBe(harness.ideId);
    expect(payload.ides).toEqual([
      {
        id: harness.ideId,
        name: "Visual Studio Code",
        host: "127.0.0.1",
        port: expect.any(Number),
        workspaceFolders: ["/work/app"],
        workspaceMatched: true,
      },
    ]);
  });

  it("lists outside IDEs but refuses their selection without changing the current mode", async () => {
    const harness = await createHarness({ ideWorkspace: "/other/project" });
    await select(harness, { kind: "off" });
    const payload = await overview(harness);
    expect(payload.automaticId).toBeUndefined();
    expect(payload.ides).toMatchObject([{ id: harness.ideId, workspaceMatched: false }]);

    const response = await select(harness, { kind: "manual", ideId: harness.ideId });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: expect.stringMatching(/does not match/i),
    });
    expect((await overview(harness)).selection).toEqual({ kind: "off" });
  });

  it("allows an IDE rooted in a descendant of the dsh workspace", async () => {
    const harness = await createHarness({ ideWorkspace: "/work/app/packages/plugin" });
    expect((await overview(harness)).ides).toMatchObject([
      { id: harness.ideId, workspaceMatched: true },
    ]);
    const response = await select(harness, { kind: "manual", ideId: harness.ideId });
    expect(response.status).toBe(200);
    expect(await selectionOf(response)).toEqual({ kind: "manual", ideId: harness.ideId });
  });

  it("applies manual, automatic, and disabled choices to the session", async () => {
    const harness = await createHarness();

    const manual = await select(harness, { kind: "manual", ideId: harness.ideId });
    expect(manual.status).toBe(200);
    expect(await selectionOf(manual)).toEqual({
      kind: "manual",
      ideId: harness.ideId,
    });
    expect((await overview(harness)).selection).toEqual({
      kind: "manual",
      ideId: harness.ideId,
    });

    expect(await selectionOf(await select(harness, { kind: "auto" }))).toEqual({
      kind: "auto",
    });
    expect(await selectionOf(await select(harness, { kind: "off" }))).toEqual({
      kind: "off",
    });
    expect((await overview(harness)).selection).toEqual({ kind: "off" });
  });

  it("refuses an IDE that is no longer reachable without changing the choice", async () => {
    const harness = await createHarness();
    await select(harness, { kind: "off" });

    const response = await select(harness, { kind: "manual", ideId: "0".repeat(64) });

    expect(response.status).toBe(409);
    expect((await response.json()) as { error: string }).toMatchObject({
      error: expect.stringMatching(/no longer reachable/i),
    });
    expect((await overview(harness)).selection).toEqual({ kind: "off" });
  });

  it("rejects malformed bodies, unknown sessions, and wrong methods", async () => {
    const harness = await createHarness();
    harness.authorize();

    expect((await select(harness, "{")).status).toBe(400);
    expect((await select(harness, { kind: "nowhere" })).status).toBe(400);
    expect((await select(harness, { kind: "manual", ideId: "" })).status).toBe(400);
    expect((await fetch(harness.url(TARGET_OVERVIEW_PATH, "missing-session"))).status).toBe(404);
    expect((await fetch(`${harness.origin}${TARGET_OVERVIEW_PATH}`)).status).toBe(400);
    expect((await fetch(harness.url(TARGET_OVERVIEW_PATH), { method: "POST" })).status).toBe(405);
    expect((await fetch(harness.url(TARGET_SELECT_PATH))).status).toBe(405);
  });

  it("scopes the choice to the session that made it", async () => {
    const harness = await createHarness();
    const other = harness.ctx.sessions.create(undefined, { meta: { cwd: "/work/app" } });

    await select(harness, { kind: "off" });

    const response = await fetch(harness.url(TARGET_OVERVIEW_PATH, other.id));
    expect(response.status).toBe(200);
    expect(await selectionOf(response)).toEqual({ kind: "auto" });
  });

  it("removes both routes when the plugin unloads", async () => {
    const harness = await createHarness();
    harness.authorize();
    expect((await fetch(harness.url(TARGET_OVERVIEW_PATH))).status).toBe(200);

    await harness.ctx.fiber.dispose();
    closers.splice(0);

    await expect(fetch(harness.url(TARGET_OVERVIEW_PATH))).rejects.toThrow();
  });
});
