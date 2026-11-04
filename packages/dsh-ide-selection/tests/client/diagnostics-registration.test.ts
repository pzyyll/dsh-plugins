// ABOUTME: Verify diagnostics mount in the input slot with real Cordis service resolution.
// ABOUTME: Keep Fix bound to client sessions without depending on a browser agents service.
import { Context } from "@deepseek-ai/cordis";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("react", () => ({
  createElement: (type: unknown, props: unknown) => ({ type, props }),
  useEffect: vi.fn(),
  useLayoutEffect: vi.fn(),
  useMemo: vi.fn(),
  useState: vi.fn(),
  useRef: vi.fn(),
  useId: vi.fn(),
}));
vi.mock("@deepseek-ai/dsh-client-ui-primitives", () => ({ Tooltip: () => null }));

import { apply, inject } from "../../src/client/index.js";
import { DiagnosticInput } from "../../src/client/diagnostics-input.js";
import type { InputActions, SendDiagnosticFix } from "../../src/client/diagnostics-stream.js";

const INPUT_SLOT = "conversation.input.overlay";
const RECEIVER_ID = "ide-diagnostics-input";
const SESSION_ID = "hero-session";
const REQUEST_ID = "diagnostic-fix-request";
const contexts: Context[] = [];

afterEach(async () => {
  for (const ctx of contexts.splice(0).reverse()) await ctx.fiber.dispose();
});

async function setup(withSessions = true) {
  const registered: Array<{
    name: string;
    id: string;
    component: (props: { sessionId: string; inputActions: InputActions }) => unknown;
  }> = [];
  const prompt = vi.fn(async () => ({ ok: true as const, value: { accepted: true as const } }));
  const beginSubmission = vi.fn(() => ({ requestId: REQUEST_ID, abandon: vi.fn() }));
  const sessions = { binding: vi.fn(() => ({ session: { prompt, beginSubmission } })) };
  const ctx = new Context();
  contexts.push(ctx);
  ctx.provide("slots", {
    inject: (_name: string, register: () => () => void) => {
      register();
    },
    register: (options: { name: string; id: string }, component: (props: never) => unknown) => {
      registered.push({ ...options, component: component as never });
      return () => {};
    },
  });
  if (withSessions) ctx.provide("sessions", sessions);
  await ctx.plugin({
    name: "ide-client-registration-test",
    inject,
    apply(scope: Context) {
      apply(scope as unknown as Parameters<typeof apply>[0]);
    },
  });
  return { ctx, registered, sessions, prompt, beginSubmission };
}

describe("diagnostic receiver registration", () => {
  it("mounts once with sessions but no agents in the shared Hero and composer input slot", async () => {
    const { ctx, registered } = await setup();
    expect(ctx.get("agents")).toBeUndefined();
    const receivers = registered.filter(({ id }) => id === RECEIVER_ID);
    expect(receivers).toHaveLength(1);
    // InputBar renders overlay in both variants, but dock only in the active composer.
    const heroSlots = ["conversation.hero.options", INPUT_SLOT];
    const composerSlots = ["conversation.composer.dock", INPUT_SLOT];
    expect(receivers.filter(({ name }) => heroSlots.includes(name))).toHaveLength(1);
    expect(receivers.filter(({ name }) => composerSlots.includes(name))).toHaveLength(1);
    expect(receivers[0]?.name).toBe(INPUT_SLOT);
  });

  it("waits for the sessions dependency rather than fabricating missing services", async () => {
    const { ctx, registered, sessions } = await setup(false);
    expect(ctx.get("sessions")).toBeUndefined();
    expect(ctx.get("agents")).toBeUndefined();
    expect(registered.filter(({ id }) => id === RECEIVER_ID)).toHaveLength(0);
    ctx.provide("sessions", sessions);
    await vi.waitFor(() => {
      expect(registered.filter(({ id }) => id === RECEIVER_ID)).toHaveLength(1);
    });
    expect(ctx.get("agents")).toBeUndefined();
  });

  it("passes mounted input actions and a stable sender using the real queued session API", async () => {
    const { registered, sessions, prompt, beginSubmission } = await setup();
    const receiver = registered.find(({ id }) => id === RECEIVER_ID)!;
    const inputActions: InputActions = {
      captureInsertion: vi.fn(() => ({ start: 0, end: 0, draftRev: 0 })),
      insertText: vi.fn(() => true),
      persistDraft: vi.fn(),
    };
    const props = { sessionId: SESSION_ID, inputActions };
    const first = receiver.component(props) as {
      type: unknown;
      props: { sessionId: string; inputActions: InputActions; sendFix: SendDiagnosticFix };
    };
    const second = receiver.component(props) as typeof first;
    expect(first.type).toBe(DiagnosticInput);
    expect(first.props.sessionId).toBe(SESSION_ID);
    expect(first.props.inputActions).toBe(inputActions);
    expect(first.props.sendFix).toBe(second.props.sendFix);
    const signal = new AbortController().signal;
    await first.props.sendFix(first.props.sessionId, "repair prompt", signal);
    expect(sessions.binding).toHaveBeenCalledWith(SESSION_ID);
    expect(beginSubmission).toHaveBeenCalledWith({
      mode: "queue",
      text: "repair prompt",
      attachments: [],
    });
    expect(prompt).toHaveBeenCalledWith(
      [{ type: "text", text: "repair prompt" }],
      "queue",
      signal,
      REQUEST_ID,
    );
    expect(inputActions.captureInsertion).not.toHaveBeenCalled();
    expect(inputActions.insertText).not.toHaveBeenCalled();
    expect(inputActions.persistDraft).not.toHaveBeenCalled();
  });
});
