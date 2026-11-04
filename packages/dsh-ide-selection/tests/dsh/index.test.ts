// ABOUTME: Tests the Cordis pre-step hook that adds durable IDE selection context.
// ABOUTME: Uses published DSH services and the real authenticated selection server.

import { createServer, type Server, type Socket } from "node:net";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Context, type Fiber, type Plugin } from "@deepseek-ai/cordis";
import { AgentRegistry, type Agent, type PreStepDecision } from "@deepseek-ai/dsh-agent";
import { createUserMessage } from "@deepseek-ai/dsh-llm";
import { CommandRuntime } from "@deepseek-ai/dsh-commands";
import {
  deriveEventMessage,
  SessionId,
  SessionStore,
  type SessionEvent,
} from "@deepseek-ai/dsh-session";
import { createLock, writeLock } from "../../src/shared/lock.js";
import { IdeServer } from "../../src/shared/server.js";
import type { EditorSelectionSnapshot } from "../../src/shared/protocol.js";
import { apply, Config, inject, name } from "../../src/dsh/index.js";

const roots: string[] = [];
const servers: IdeServer[] = [];
const rawServers: Server[] = [];
const rawSockets = new Set<Socket>();
const fibers: Fiber[] = [];

afterEach(async () => {
  await Promise.all(
    fibers
      .splice(0)
      .reverse()
      .map((fiber) => fiber.dispose()),
  );
  await Promise.all(servers.splice(0).map((server) => server.stop()));
  for (const socket of rawSockets) socket.destroy();
  await Promise.all(
    rawServers
      .splice(0)
      .map((server) => new Promise<void>((resolve) => server.close(() => resolve()))),
  );
  await Promise.all(roots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

const initialSnapshot: EditorSelectionSnapshot = {
  source: "vscode",
  filePath: "/work/app/example.ts",
  workspaceFolder: "/work/app",
  ranges: [
    {
      text: "const selected = 1;",
      selection: { start: { line: 2, character: 0 }, end: { line: 2, character: 19 } },
    },
  ],
};

interface Harness {
  ctx: Context;
  session: ReturnType<SessionStore["create"]>;
  agent: Agent;
  selected: EditorSelectionSnapshot | undefined;
  getSelectionCalls(): number;
  pluginFiber: Fiber;
  dispatch(input?: {
    turn?: number;
    step?: number;
    signal?: AbortSignal;
    result?: PreStepDecision;
    messages?: ReturnType<typeof createUserMessage>[];
  }): Promise<unknown>;
}

async function raceWithTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    promise,
    new Promise<never>((_resolve, reject) => {
      timer = setTimeout(
        () => reject(new Error("Timed out waiting for the IDE connection to close")),
        timeoutMs,
      );
    }),
  ]).finally(() => clearTimeout(timer));
}

async function createHarness(
  options: {
    snapshot?: EditorSelectionSnapshot | undefined;
    cwd?: string | undefined;
    parentSession?: string;
    origin?: "subagent";
    lockPort?: number;
    timeoutMs?: number;
  } = {},
): Promise<Harness> {
  const lockDir = await mkdtemp(join(tmpdir(), "dsh-ide-context-"));
  roots.push(lockDir);
  let selected = Object.hasOwn(options, "snapshot") ? options.snapshot : initialSnapshot;
  let selectionCalls = 0;
  const server = new IdeServer("f".repeat(64), () => {
    selectionCalls += 1;
    return selected;
  });
  servers.push(server);
  const port = await server.start();
  await writeLock(
    join(lockDir, "vscode.lock"),
    createLock(options.lockPort ?? port, "f".repeat(64), ["/work/app"]),
  );

  const ctx = new Context();
  fibers.push(await ctx.plugin(SessionStore));
  fibers.push(await ctx.plugin(AgentRegistry));
  const plugin: Plugin = { name, inject, Config, apply };
  const pluginFiber = await ctx.plugin(plugin, {
    lockDir,
    timeoutMs: options.timeoutMs ?? 1_000,
    maxAgeMs: 180_000,
    maxChars: 24_000,
  });
  fibers.push(pluginFiber);
  const session = ctx.sessions.create(undefined, {
    meta: {
      ...(Object.hasOwn(options, "cwd")
        ? options.cwd === undefined
          ? {}
          : { cwd: options.cwd }
        : { cwd: "/work/app" }),
      ...(options.parentSession === undefined
        ? {}
        : { parentSession: SessionId(options.parentSession) }),
      ...(options.origin === undefined ? {} : { origin: options.origin }),
    },
  });
  const agent = { id: session.id, session } as Agent;
  const userMessage = createUserMessage({
    content: [{ type: "text", text: "Explain this selection" }],
    source: { kind: "user" },
  });

  return {
    ctx,
    session,
    agent,
    pluginFiber,
    get selected() {
      return selected;
    },
    set selected(value: EditorSelectionSnapshot | undefined) {
      selected = value;
      server.broadcast(value);
    },
    getSelectionCalls: () => selectionCalls,
    async dispatch(input = {}) {
      const { turn = 1, step = 1, signal = new AbortController().signal } = input;
      const messages = input.messages ?? [userMessage];
      const next = async () => input.result ?? { kind: "enter" as const, messages };
      return ctx.waterfall("agent/pre-step", { agent, messages, turn, step, signal }, next);
    },
  };
}

describe("IDE selection context plugin", () => {
  it("uses the session command mode for durable turn injection", async () => {
    const harness = await createHarness();
    fibers.push(await harness.ctx.plugin(CommandRuntime));
    const signal = new AbortController().signal;
    const off = await harness.ctx.commands.execute(harness.agent, "/select-ide off", [], signal);
    expect(off?.result.kind).toBe("success");
    expect(((await harness.dispatch()) as { messages: unknown[] }).messages).toHaveLength(1);
    expect(harness.getSelectionCalls()).toBe(0);
    const auto = await harness.ctx.commands.execute(harness.agent, "/select-ide auto", [], signal);
    expect(auto?.result.kind).toBe("success");
    expect(((await harness.dispatch()) as { messages: unknown[] }).messages).toHaveLength(2);
  });

  it("adds the current selection as an attributed snapshot user message on an eligible first step", async () => {
    const harness = await createHarness();
    const decision = await harness.dispatch();

    expect(decision).toMatchObject({ kind: "enter", messages: expect.any(Array) });
    const messages = (decision as { messages: Array<{ content: unknown; source: unknown }> })
      .messages;
    const injected = messages.at(-1);
    expect(injected?.source).toEqual({
      kind: "ide-selection-context",
      form: "snapshot",
      sections: [
        {
          name,
          text: expect.stringContaining("const selected = 1;"),
        },
      ],
    });
    expect(JSON.stringify(injected?.content)).toContain("const selected = 1;");
    expect(harness.getSelectionCalls()).toBe(1);
  });

  it("retains selected text and source through Session append and JSON event derivation", async () => {
    const harness = await createHarness();
    const decision = (await harness.dispatch()) as PreStepDecision;
    if (decision.kind !== "enter") throw new Error("expected the step to be admitted");

    const events = decision.messages.map((message) =>
      harness.session.append("user/message", message, { surfaceOp: "append" }),
    );
    const restoredEvents = JSON.parse(JSON.stringify(events)) as SessionEvent[];
    const derivedMessages = restoredEvents
      .map((event) => deriveEventMessage(event))
      .filter((message) => message !== null);
    const selectedMessage = derivedMessages.find((message) => message.source.kind === name);

    expect(selectedMessage?.source).toMatchObject({ kind: name, form: "snapshot" });
    expect(JSON.stringify(selectedMessage?.content)).toContain("const selected = 1;");
  });

  it("reuses the live connection across turns and consumes selection notifications", async () => {
    const harness = await createHarness();
    const first = await harness.dispatch({ turn: 1 });
    const unchanged = await harness.dispatch({ turn: 2 });
    expect(JSON.stringify(first)).toContain("const selected = 1;");
    expect(JSON.stringify(unchanged)).toContain("const selected = 1;");
    harness.selected = {
      ...initialSnapshot,
      ranges: initialSnapshot.ranges.map((range) => ({ ...range, text: "const selected = 2;" })),
    };
    await vi.waitFor(async () => {
      const changed = await harness.dispatch({ turn: 3 });
      expect(JSON.stringify(changed)).toContain("const selected = 2;");
    });
    expect(harness.getSelectionCalls()).toBe(1);
  });

  it.each([
    ["later step", { step: 2 }],
    ["rejected step", { result: { kind: "reject" as const } }],
    ["aborted step", { signal: AbortSignal.abort() }],
  ])("does not read selection for a %s", async (_label, input) => {
    const harness = await createHarness();
    const decision = await harness.dispatch(input);

    expect(harness.getSelectionCalls()).toBe(0);
    if ("result" in input) expect(decision).toMatchObject(input.result);
    else expect(decision).toMatchObject({ kind: "enter" });
  });

  it("does not read selection when the accepted step contains no user message", async () => {
    const synthetic = createUserMessage({
      content: [{ type: "text", text: "Scheduled continuation" }],
      source: { kind: "ide-selection-context", form: "snapshot", sections: [] },
    });
    const harness = await createHarness();
    const decision = await harness.dispatch({ messages: [synthetic] });

    expect(harness.getSelectionCalls()).toBe(0);
    expect((decision as { messages: unknown[] }).messages).toHaveLength(1);
  });

  it("does not read selection for subagent sessions", async () => {
    const harness = await createHarness({ origin: "subagent" });
    const decision = await harness.dispatch();

    expect(harness.getSelectionCalls()).toBe(0);
    expect((decision as { messages: unknown[] }).messages).toHaveLength(1);
  });

  it("allows a human fork session to receive its workspace selection", async () => {
    const harness = await createHarness({ parentSession: "human-parent" });
    const decision = await harness.dispatch();

    expect(harness.getSelectionCalls()).toBe(1);
    expect((decision as { messages: unknown[] }).messages).toHaveLength(2);
  });

  it("does not read selection when the Session has no workspace cwd", async () => {
    const harness = await createHarness({ cwd: undefined });
    const decision = await harness.dispatch();

    expect(harness.getSelectionCalls()).toBe(0);
    expect((decision as { messages: unknown[] }).messages).toHaveLength(1);
  });

  it("aborts an initial connection wait when the plugin is disposed", async () => {
    let connected!: () => void;
    let disconnected!: () => void;
    const connectionAccepted = new Promise<void>((resolve) => (connected = resolve));
    const connectionClosed = new Promise<void>((resolve) => (disconnected = resolve));
    const pendingServer = createServer();
    pendingServer.on("connection", (socket) => {
      rawSockets.add(socket);
      socket.resume();
      connected();
      socket.once("close", () => {
        rawSockets.delete(socket);
        disconnected();
      });
    });
    rawServers.push(pendingServer);
    await new Promise<void>((resolve) => pendingServer.listen(0, "127.0.0.1", resolve));
    const address = pendingServer.address();
    if (!address || typeof address === "string") throw new Error("test server did not bind");

    const harness = await createHarness({ lockPort: address.port, timeoutMs: 5_000 });
    const dispatch = harness.dispatch();
    await connectionAccepted;
    await harness.pluginFiber.dispose();
    await expect(
      raceWithTimeout(
        connectionClosed.then(() => "closed"),
        500,
      ),
    ).resolves.toBe("closed");
    await expect(dispatch).resolves.toMatchObject({ kind: "enter", messages: expect.any(Array) });
  });

  it("does not inject a cleared or unavailable selection", async () => {
    const harness = await createHarness({ snapshot: undefined });
    const decision = await harness.dispatch();

    expect(harness.getSelectionCalls()).toBe(1);
    expect((decision as { messages: unknown[] }).messages).toHaveLength(1);
  });
});
