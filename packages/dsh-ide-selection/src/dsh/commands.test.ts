// ABOUTME: Exercise the IDE selection slash command through the real dsh command service.
// ABOUTME: Use live local IDE servers and session-scoped choices rather than fake transports.

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { Context, type Fiber, type Plugin } from "@deepseek-ai/cordis";
import { AgentRegistry, type Agent } from "@deepseek-ai/dsh-agent";
import { CommandRuntime } from "@deepseek-ai/dsh-commands";
import { SessionId, SessionStore } from "@deepseek-ai/dsh-session";
import { en } from "../client/locales.js";
import { createLock, writeLock } from "../shared/lock.js";
import { IdeServer } from "../shared/server.js";
import { registerSelectIdeCommand } from "./commands.js";
import { IdeConnections } from "./ide-connections.js";

const fibers: Fiber[] = [];
const roots: string[] = [];
const servers: IdeServer[] = [];
const cleanups: Array<() => void> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  await Promise.all(
    fibers
      .splice(0)
      .reverse()
      .map((fiber) => fiber.dispose()),
  );
  await Promise.all(servers.splice(0).map((server) => server.stop()));
  await Promise.all(roots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

interface Harness {
  ctx: Context;
  agent: Agent;
  connections: IdeConnections;
  lockDir: string;
  commandFiber: Fiber;
}

async function createHarness(
  options: { cwd?: string | undefined; ide?: boolean } = {},
): Promise<Harness> {
  const lockDir = await mkdtemp(join(tmpdir(), "dsh-select-ide-"));
  roots.push(lockDir);
  if (options.ide !== false) {
    const server = new IdeServer("c".repeat(64), () => undefined);
    servers.push(server);
    const port = await server.start();
    await writeLock(
      join(lockDir, "vscode-one.lock"),
      createLock(port, "c".repeat(64), ["/work/one"]),
    );
  }

  const ctx = new Context();
  fibers.push(await ctx.plugin(SessionStore));
  fibers.push(await ctx.plugin(AgentRegistry));
  fibers.push(await ctx.plugin(CommandRuntime));
  const meta = Object.hasOwn(options, "cwd")
    ? options.cwd === undefined
      ? {}
      : { cwd: options.cwd }
    : { cwd: "/work/one" };
  const session = ctx.sessions.create(undefined, { meta });
  const agent = { id: session.id, session } as Agent;
  const disposeAgent = ctx.agents.enter(agent, undefined);
  const lifetime = new AbortController();
  cleanups.push(() => {
    lifetime.abort();
    disposeAgent();
  });
  const connections = new IdeConnections({
    lockDir,
    timeoutMs: 1_000,
    maxAgeMs: 60_000,
    signal: lifetime.signal,
  });
  const plugin: Plugin = {
    name: "select-ide-command-test",
    apply(scope) {
      registerSelectIdeCommand(scope, connections, lifetime.signal);
    },
  };
  const commandFiber = await ctx.plugin(plugin);
  fibers.push(commandFiber);
  return { ctx, agent, connections, lockDir, commandFiber };
}

async function run(ctx: Context, agent: Agent, rawInput = "") {
  const execution = await ctx.commands.execute(
    agent,
    `/select-ide${rawInput}`,
    [],
    new AbortController().signal,
  );
  if (!execution) throw new Error("select-ide command was not registered");
  return execution.result;
}

describe("/select-ide", () => {
  it("registers without an argument hint so the client picker owns the bare invocation", async () => {
    const harness = await createHarness();

    const command = harness.ctx.commands.find(harness.agent, "select-ide");
    expect(command?.input).toBeUndefined();
    expect(command?.description).toBe(en["command.description"]);
  });

  it("lists every reachable IDE as text for a bare invocation", async () => {
    const harness = await createHarness();

    const result = await run(harness.ctx, harness.agent);

    expect(result).toEqual({ kind: "success", text: expect.any(String) });
    expect(result.text).toContain("Visual Studio Code");
    expect(result.text).toContain("/work/one");
    expect(result.text).toContain("127.0.0.1:");
    expect(result.text).not.toContain("c".repeat(64));
  });

  it("switches explicit auto and off arguments for programmatic callers", async () => {
    const harness = await createHarness();

    expect(await run(harness.ctx, harness.agent, " off")).toEqual({
      kind: "success",
      text: expect.any(String),
    });
    expect(harness.connections.getTarget(harness.agent.id)).toEqual({ kind: "off" });
    expect((await run(harness.ctx, harness.agent, " auto")).kind).toBe("success");
    expect(harness.connections.getTarget(harness.agent.id)).toEqual({ kind: "auto" });
  });

  it("selects one listed IDE for the invoking Session only", async () => {
    const harness = await createHarness();
    const [available] = await harness.connections.list("/work/one", new AbortController().signal);
    if (!available) throw new Error("fixture IDE was not reachable");

    const result = await run(harness.ctx, harness.agent, ` ${available.id}`);

    expect(result).toEqual({
      kind: "success",
      text: expect.stringContaining("Visual Studio Code"),
    });
    expect(harness.connections.getTarget(harness.agent.id)).toEqual({
      kind: "manual",
      ideId: available.id,
    });
    expect(harness.connections.getTarget(SessionId("other-session"))).toEqual({ kind: "auto" });
  });

  it("keeps the previous choice when an IDE id is no longer reachable", async () => {
    const harness = await createHarness();
    harness.connections.setMode(harness.agent.id, "off");

    const result = await run(harness.ctx, harness.agent, ` ${"0".repeat(64)}`);

    expect(result.kind).toBe("error");
    expect(result.text).toMatch(/no longer reachable/i);
    expect(harness.connections.getTarget(harness.agent.id)).toEqual({ kind: "off" });
  });

  it("reports a Session without a workspace directory", async () => {
    const harness = await createHarness({ cwd: undefined });

    const result = await run(harness.ctx, harness.agent);

    expect(result.kind).toBe("error");
    expect(result.text).toMatch(/no workspace/i);
  });

  it("answers a bare invocation when no local IDE is reachable", async () => {
    const harness = await createHarness({ ide: false });

    const result = await run(harness.ctx, harness.agent);

    expect(result).toEqual({ kind: "success", text: expect.stringMatching(/no local IDE/i) });
  });

  it("unregisters the command with its registration scope", async () => {
    const harness = await createHarness();
    expect(harness.ctx.commands.find(harness.agent, "select-ide")).toBeDefined();

    await harness.commandFiber.dispose();

    expect(harness.ctx.commands.find(harness.agent, "select-ide")).toBeUndefined();
  });
});
