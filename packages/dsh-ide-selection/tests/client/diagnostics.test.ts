// ABOUTME: Verify the diagnostics SSE receiver inserts at the live composer span safely.
// ABOUTME: Cover bounded wire data, refused edits, teardown, and stale stream callbacks.
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  bindDiagnosticInput,
  DIAGNOSTICS_STREAM_URL,
  MAX_FORMATTED_DIAGNOSTIC_CHARS,
  type InputActions,
} from "../../src/client/diagnostics-stream.js";

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
  it("inserts at the current span and persists only the draft without submitting", () => {
    vi.stubGlobal("EventSource", MockEventSource);
    const input = actions();
    const fallback = vi.fn();
    bindDiagnosticInput("session / one", input.value, fallback);
    const stream = MockEventSource.instances[0]!;

    expect(stream.url).toBe(`${DIAGNOSTICS_STREAM_URL}?session=session%20%2F%20one`);
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

  it("ignores malformed and oversized messages", () => {
    vi.stubGlobal("EventSource", MockEventSource);
    const input = actions();
    const fallback = vi.fn();
    bindDiagnosticInput("session", input.value, fallback);
    const stream = MockEventSource.instances[0]!;

    stream.emitRaw("not json");
    stream.emit({ type: "other", text: "nope" });
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
