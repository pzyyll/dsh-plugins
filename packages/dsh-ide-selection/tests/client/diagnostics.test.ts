// ABOUTME: Verify the diagnostics SSE receiver inserts at the live composer span safely.
// ABOUTME: Cover bounded wire data, refused edits, teardown, and stale stream callbacks.
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  bindDiagnosticInput as bindInput,
  MAX_FORMATTED_DIAGNOSTIC_CHARS,
  type InputActions,
} from "../../src/client/diagnostics-stream.js";
import { IDE_EVENTS_URL, type SubscribeIdeEvents } from "../../src/client/ide-stream.js";

const cleanups: Array<() => void> = [];
function bindDiagnosticInput(...args: Parameters<typeof bindInput>): () => void {
  const cleanup = bindInput(...args);
  cleanups.push(cleanup);
  return cleanup;
}

class MockEventSource {
  static instances: MockEventSource[] = [];
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;
  constructor(readonly url: string) {
    MockEventSource.instances.push(this);
  }
  close(): void {
    this.closed = true;
  }
  emit(value: unknown): void {
    this.onmessage?.({ data: JSON.stringify(value) });
  }
  emitRaw(data: string): void {
    this.onmessage?.({ data });
  }
}

afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
  vi.unstubAllGlobals();
  MockEventSource.instances = [];
});

function actions(overrides: Partial<InputActions> = {}) {
  const captureInsertion = vi.fn(() => ({ start: 5, end: 5, draftRev: 9 }));
  const insertText = vi.fn(() => true);
  const persistDraft = vi.fn();
  return {
    value: { captureInsertion, insertText, persistDraft, ...overrides } as InputActions,
    captureInsertion,
    insertText,
    persistDraft,
  };
}

describe("diagnostics input stream", () => {
  it("inserts selection references without sending and preserves refused edits for retry", () => {
    vi.stubGlobal("EventSource", MockEventSource);
    const input = actions();
    const sendFix = vi.fn();
    const fallback = vi.fn();
    const cleanup = bindDiagnosticInput("selection-session", input.value, fallback, sendFix);
    const source = MockEventSource.instances[0]!;
    const text = "@src/example.ts#L10-L12\n";
    source.emit({ type: "selection", text });
    expect(input.insertText).toHaveBeenCalledWith(text, { start: 5, end: 5, draftRev: 9 });
    expect(input.persistDraft).toHaveBeenCalledOnce();
    expect(sendFix).not.toHaveBeenCalled();

    input.insertText.mockReturnValue(false);
    source.emit({ type: "selection", text });
    expect(fallback).toHaveBeenCalledOnce();
    const retry = fallback.mock.calls[0]![1] as () => boolean;
    input.insertText.mockReturnValue(true);
    expect(retry()).toBe(true);
    cleanup();
    expect(retry()).toBe(false);
  });

  it("ignores malformed and oversized selection input", () => {
    vi.stubGlobal("EventSource", MockEventSource);
    const input = actions();
    bindDiagnosticInput("selection-session", input.value, vi.fn());
    const source = MockEventSource.instances[0]!;
    for (const text of [undefined, "", 1, "x".repeat(MAX_FORMATTED_DIAGNOSTIC_CHARS + 1)])
      source.emit({ type: "selection", text });
    expect(input.captureInsertion).not.toHaveBeenCalled();
  });

  it("subscribes by session and invalidates injected callbacks and retries on cleanup", () => {
    let listener!: (event: unknown) => void;
    const unsubscribe = vi.fn();
    const subscribe: SubscribeIdeEvents = vi.fn((sessionId, type, onEvent) => {
      expect(sessionId).toBe("bound-session");
      expect(["diagnostic", "selection"]).toContain(type);
      if (type === "diagnostic") listener = onEvent;
      return unsubscribe;
    });
    const input = actions({ insertText: vi.fn(() => false) });
    const fallback = vi.fn();
    const cleanup = bindDiagnosticInput(
      "bound-session",
      input.value,
      fallback,
      undefined,
      subscribe,
    );
    listener({ type: "diagnostic", text: "refused" });
    const retry = fallback.mock.calls[0]?.[1] as () => boolean;

    cleanup();
    cleanup();
    listener({ type: "diagnostic", text: "late" });
    expect(retry()).toBe(false);
    expect(unsubscribe).toHaveBeenCalledTimes(2);
    expect(input.captureInsertion).toHaveBeenCalledOnce();
    expect(fallback).toHaveBeenCalledOnce();
  });

  it("inserts at the current span and persists only the draft without submitting", () => {
    vi.stubGlobal("EventSource", MockEventSource);
    const input = actions();
    const fallback = vi.fn();
    bindDiagnosticInput("session / one", input.value, fallback);
    const stream = MockEventSource.instances[0]!;

    expect(stream.url).toBe(`${IDE_EVENTS_URL}?session=session%20%2F%20one`);
    stream.emit({ type: "ready" });
    stream.emit({ type: "diagnostic", text: "<ide-diagnostics>problem</ide-diagnostics>" });

    expect(input.captureInsertion).toHaveBeenCalledOnce();
    expect(input.insertText).toHaveBeenCalledWith("<ide-diagnostics>problem</ide-diagnostics>", {
      start: 5,
      end: 5,
      draftRev: 9,
    });
    expect(input.persistDraft).toHaveBeenCalledOnce();
    expect(fallback).not.toHaveBeenCalled();
    expect(input.value).not.toHaveProperty("setDraft");
    expect(input.value).not.toHaveProperty("submit");
  });

  it("fix-only events send directly and never inspect or mutate the draft", async () => {
    vi.stubGlobal("EventSource", MockEventSource);
    const input = actions();
    const sendFix = vi.fn(async () => {});
    const fallback = vi.fn();
    bindDiagnosticInput("session", input.value, fallback, sendFix);
    const stream = MockEventSource.instances[0]!;

    expect(stream.url).toBe(`${IDE_EVENTS_URL}?session=session`);
    stream.emit({ type: "diagnostic", action: "fix", text: "repair prompt" });
    await Promise.resolve();
    await Promise.resolve();

    expect(sendFix).toHaveBeenCalledOnce();
    expect(sendFix).toHaveBeenCalledWith("session", "repair prompt", expect.any(AbortSignal));
    expect(input.captureInsertion).not.toHaveBeenCalled();
    expect(input.insertText).not.toHaveBeenCalled();
    expect(input.persistDraft).not.toHaveBeenCalled();
    expect(fallback).not.toHaveBeenCalled();
  });

  it("ignores fix events without a sender and unknown actions", () => {
    vi.stubGlobal("EventSource", MockEventSource);
    const input = actions();
    const fallback = vi.fn();
    bindDiagnosticInput("session", input.value, fallback);
    const stream = MockEventSource.instances[0]!;

    expect(stream.url).toBe(`${IDE_EVENTS_URL}?session=session`);
    stream.emit({ type: "diagnostic", action: "unknown", text: "nope" });
    stream.emit({ type: "diagnostic", action: "fix", text: "not supported" });
    expect(input.insertText).not.toHaveBeenCalled();
    expect(fallback).not.toHaveBeenCalled();
  });

  it("keeps legacy and explicit send-diagnostic events insert-only", () => {
    vi.stubGlobal("EventSource", MockEventSource);
    const input = actions();
    const sendFix = vi.fn(async () => {});
    bindDiagnosticInput("session", input.value, vi.fn(), sendFix);
    const stream = MockEventSource.instances[0]!;
    stream.emit({ type: "diagnostic", text: "legacy" });
    stream.emit({ type: "diagnostic", action: "send-diagnostic", text: "explicit" });
    expect(input.insertText).toHaveBeenNthCalledWith(1, "legacy", expect.anything());
    expect(input.insertText).toHaveBeenNthCalledWith(2, "explicit", expect.anything());
    expect(sendFix).not.toHaveBeenCalled();
  });

  it("ignores malformed and oversized messages", () => {
    vi.stubGlobal("EventSource", MockEventSource);
    const input = actions();
    const fallback = vi.fn();
    bindDiagnosticInput("session", input.value, fallback);
    const stream = MockEventSource.instances[0]!;

    stream.emitRaw("not json");
    stream.emit({ type: "other", text: "nope" });
    for (const value of [null, [], false, 42, "diagnostic", { type: "diagnostic", text: 42 }])
      stream.emit(value);
    stream.emit({ type: "diagnostic", text: "" });
    stream.emit({ type: "diagnostic", text: "x".repeat(MAX_FORMATTED_DIAGNOSTIC_CHARS + 1) });

    expect(input.insertText).not.toHaveBeenCalled();
    expect(input.persistDraft).not.toHaveBeenCalled();
    expect(fallback).not.toHaveBeenCalled();
  });

  it("keeps refused text available and retries with a fresh captured span", () => {
    vi.stubGlobal("EventSource", MockEventSource);
    const input = actions({ insertText: vi.fn().mockReturnValueOnce(false).mockReturnValue(true) });
    const fallback = vi.fn();
    bindDiagnosticInput("session", input.value, fallback);
    MockEventSource.instances[0]!.emit({ type: "diagnostic", text: "keep this" });

    expect(fallback).toHaveBeenCalledOnce();
    expect(fallback.mock.calls[0]?.[0]).toBe("keep this");
    expect(input.persistDraft).not.toHaveBeenCalled();
    const retry = fallback.mock.calls[0]?.[1] as () => boolean;
    expect(retry()).toBe(true);
    expect(input.captureInsertion).toHaveBeenCalledTimes(2);
    expect(input.persistDraft).toHaveBeenCalledOnce();
  });

  it("surfaces diagnostics when insertion throws", () => {
    vi.stubGlobal("EventSource", MockEventSource);
    const input = actions({
      insertText: vi.fn(() => {
        throw new Error("insertion failed");
      }),
    });
    const fallback = vi.fn();
    bindDiagnosticInput("session", input.value, fallback);
    MockEventSource.instances[0]!.emit({ type: "diagnostic", text: "keep this" });

    expect(fallback).toHaveBeenCalledOnce();
    expect(fallback.mock.calls[0]?.[0]).toBe("keep this");
    expect(input.persistDraft).not.toHaveBeenCalled();
  });

  it("does not offer duplicate retry when persistence throws after insertion", () => {
    vi.stubGlobal("EventSource", MockEventSource);
    const persistDraft = vi.fn(() => {
      throw new Error("persistence failed");
    });
    const input = actions({ persistDraft });
    const fallback = vi.fn();
    bindDiagnosticInput("session", input.value, fallback);
    MockEventSource.instances[0]!.emit({ type: "diagnostic", text: "already inserted" });

    expect(input.insertText).toHaveBeenCalledOnce();
    expect(persistDraft).toHaveBeenCalledOnce();
    expect(fallback).not.toHaveBeenCalled();
  });

  it("keeps failed fix text for manual insertion and never resends on retry", async () => {
    vi.stubGlobal("EventSource", MockEventSource);
    const input = actions();
    const sendFix = vi.fn(async () => {
      throw new Error("send refused");
    });
    const fallback = vi.fn();
    bindDiagnosticInput("session", input.value, fallback, sendFix);
    MockEventSource.instances[0]!.emit({ type: "diagnostic", action: "fix", text: "repair" });
    await vi.waitFor(() => expect(fallback).toHaveBeenCalledOnce());

    expect(sendFix).toHaveBeenCalledOnce();
    expect(fallback).toHaveBeenCalledOnce();
    expect(fallback.mock.calls[0]?.[0]).toBe("repair");
    expect(fallback.mock.calls[0]?.[2]).toMatchObject({ action: "fix", error: "send refused" });
    const retry = fallback.mock.calls[0]?.[1] as () => boolean;
    expect(retry()).toBe(true);
    expect(input.insertText).toHaveBeenCalledOnce();
    expect(input.persistDraft).toHaveBeenCalledOnce();
    expect(sendFix).toHaveBeenCalledOnce();
  });

  it("does not invoke a deferred sender when cleanup happens synchronously after the event", async () => {
    vi.stubGlobal("EventSource", MockEventSource);
    const input = actions();
    const sendFix = vi.fn(async () => {});
    const cleanup = bindDiagnosticInput("session", input.value, vi.fn(), sendFix);
    MockEventSource.instances[0]!.emit({ type: "diagnostic", action: "fix", text: "repair" });
    cleanup();
    await Promise.resolve();
    await Promise.resolve();
    expect(sendFix).not.toHaveBeenCalled();
    expect(input.insertText).not.toHaveBeenCalled();
  });

  it("suppresses a failed send and late rejection after cleanup", async () => {
    vi.stubGlobal("EventSource", MockEventSource);
    const input = actions();
    let reject!: (reason: Error) => void;
    const sendFix = vi.fn(
      (_sessionId: string, _text: string, _signal: AbortSignal) =>
        new Promise<void>((_resolve, fail) => {
          reject = fail;
        }),
    );
    const fallback = vi.fn();
    const cleanup = bindDiagnosticInput("session", input.value, fallback, sendFix);
    MockEventSource.instances[0]!.emit({ type: "diagnostic", action: "fix", text: "repair" });
    await Promise.resolve();
    const signal = sendFix.mock.calls[0]?.[2];
    expect(signal?.aborted).toBe(false);
    cleanup();
    expect(signal?.aborted).toBe(true);
    reject(new Error("late"));
    await Promise.resolve();
    await Promise.resolve();
    expect(fallback).not.toHaveBeenCalled();
    expect(input.insertText).not.toHaveBeenCalled();
  });

  it("closes on cleanup and ignores callbacks retained by a stale source", () => {
    vi.stubGlobal("EventSource", MockEventSource);
    const input = actions();
    const fallback = vi.fn();
    const cleanup = bindDiagnosticInput("session", input.value, fallback);
    const stream = MockEventSource.instances[0]!;
    const staleCallback = stream.onmessage!;
    cleanup();
    staleCallback({ data: JSON.stringify({ type: "diagnostic", text: "stale" }) });

    expect(stream.closed).toBe(true);
    expect(stream.onmessage).toBeNull();
    expect(input.insertText).not.toHaveBeenCalled();
    expect(input.persistDraft).not.toHaveBeenCalled();
  });
});
