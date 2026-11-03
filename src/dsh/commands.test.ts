// ABOUTME: Exercise the IDE selection slash command through real dsh command and question services.
// ABOUTME: Use live local IDE servers and session-scoped choices rather than fake transports.

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Context, type Fiber, type Plugin } from "@deepseek-ai/cordis";
import { AgentRegistry, type Agent } from "@deepseek-ai/dsh-agent";
import { CommandRuntime } from "@deepseek-ai/dsh-commands";
import { SessionId, SessionStore } from "@deepseek-ai/dsh-session";
import { UserQuestionService, type AskUserQuestionRequest } from "@deepseek-ai/dsh-user-questions";
import { createLock, writeLock } from "../shared/lock.js";
import { IdeServer } from "../shared/server.js";
import { IdeConnections } from "./ide-connections.js";
import { registerSelectIdeCommand } from "./commands.js";

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
  requests: AskUserQuestionRequest[];
  disposeAgent(): void;
  commandFiber: Fiber;
}

async function createHarness(
  answer?: (request: AskUserQuestionRequest) => string[] | Promise<string[]>,
  options: { userQuestions?: boolean; ide?: boolean } = {},
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
  if (options.userQuestions !== false) fibers.push(await ctx.plugin(UserQuestionService));
  const requests: AskUserQuestionRequest[] = [];
  if (answer) {
    ctx.on("user-questions/request", async (request) => {
      requests.push(request);
      return {
        answers: await Promise.all(
          request.questions.map(async (question) => ({
            id: question.id,
            selected: await answer(request),
          })),
        ),
      };
    });
  }
  const session = ctx.sessions.create(undefined, { meta: { cwd: "/work/one" } });
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
  return { ctx, agent, connections, requests, disposeAgent, commandFiber };
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
  it("offers available IDEs and changes only the invoking Session's target", async () => {
    const harness = await createHarness((request) => {
      const options = request.questions[0]?.options ?? [];
      const chosen = options.find((option) => option.label.includes("127.0.0.1:"));
      if (!chosen) throw new Error(`missing IDE option: ${JSON.stringify(options)}`);
      return [chosen.label];
    });
    const otherSession = SessionId("session-select-ide-other");
    const result = await run(harness.ctx, harness.agent);

    expect(result).toEqual({ kind: "success", text: expect.any(String) });
    expect(harness.requests).toHaveLength(1);
    expect(harness.requests[0]?.questions).toHaveLength(1);
    expect(harness.requests[0]?.questions[0]?.multiSelect).toBe(false);
    expect(harness.requests[0]?.questions[0]?.options?.map((option) => option.label)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Automatic workspace selection"),
        expect.stringContaining("Disable IDE integration"),
      ]),
    );
    expect(harness.connections.getTarget(harness.agent.id)).toMatchObject({ kind: "manual" });
    expect(harness.connections.getTarget(otherSession)).toEqual({ kind: "auto" });
  });

  it("leaves the existing target unchanged when the picker is skipped", async () => {
    const harness = await createHarness(() => []);
    harness.connections.setMode(harness.agent.id, "off");
    const before = harness.connections.getTarget(harness.agent.id);

    const result = await run(harness.ctx, harness.agent);

    expect(result).toEqual({ kind: "success", text: expect.any(String) });
    expect(harness.connections.getTarget(harness.agent.id)).toBe(before);
  });

  it("rejects a no-argument picker when no question provider is available", async () => {
    const harness = await createHarness();
    const result = await run(harness.ctx, harness.agent);

    expect(result.kind).toBe("error");
    expect(result.text).toMatch(/question|picker|provider/i);
    expect(harness.connections.getTarget(harness.agent.id)).toEqual({ kind: "auto" });
  });

  it("returns an actionable error when there are no local IDE connections", async () => {
    const harness = await createHarness(undefined, { ide: false });
    const result = await run(harness.ctx, harness.agent);

    expect(result.kind).toBe("error");
    expect(result.text).toMatch(/no local IDE connections/i);
    expect(harness.connections.getTarget(harness.agent.id)).toEqual({ kind: "auto" });
  });

  it("registers list and mode actions without a user-question service", async () => {
    const harness = await createHarness(undefined, { userQuestions: false });
    expect((await run(harness.ctx, harness.agent, " off")).kind).toBe("success");
    expect((await run(harness.ctx, harness.agent, " auto")).kind).toBe("success");
    const picker = await run(harness.ctx, harness.agent);
    expect(picker.kind).toBe("error");
    expect(picker.text).toMatch(/user-question provider/i);
    expect(harness.ctx.commands.find(harness.agent, "select-ide")).toBeDefined();
  });

  it("aborts a pending native picker when its registration scope unloads", async () => {
    let release!: (labels: string[]) => void;
    const harness = await createHarness(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const pending = run(harness.ctx, harness.agent);
    await vi.waitFor(() => expect(harness.requests).toHaveLength(1));
    await harness.commandFiber.dispose();
    const result = await pending;
    expect(result.kind).toBe("error");
    expect(result.text).toMatch(/cancelled|picker/i);
    release([]);
  });

  it("supports readable listing and explicit auto/off modes", async () => {
    const harness = await createHarness();

    const listing = await run(harness.ctx, harness.agent, " list");
    expect(listing.kind).toBe("success");
    expect(listing.text).toContain("Visual Studio Code");
    expect(listing.text).not.toContain("c".repeat(64));

    expect((await run(harness.ctx, harness.agent, " off")).kind).toBe("success");
    expect(harness.connections.getTarget(harness.agent.id)).toEqual({ kind: "off" });
    expect((await run(harness.ctx, harness.agent, " auto")).kind).toBe("success");
    expect(harness.connections.getTarget(harness.agent.id)).toEqual({ kind: "auto" });
  });
});
