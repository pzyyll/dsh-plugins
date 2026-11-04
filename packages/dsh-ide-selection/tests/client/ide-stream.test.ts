// ABOUTME: Exercise the real shared browser transport for IDE status and diagnostic consumers.
// ABOUTME: Guard session isolation, status-only replay, reconnect errors, and reference-counted cleanup.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bindDiagnosticInput } from "../../src/client/diagnostics-stream.js";
import { IDE_EVENTS_URL, subscribeIdeEvents } from "../../src/client/ide-stream.js";

const SESSION_ID = "session / one";
const OTHER_SESSION_ID = "session-two";
const CONNECTED_STATUS = { type: "status", connected: true, text: "selection", lines: 1 };
const DISCONNECTED_STATUS = { type: "status", connected: false };
const DIAGNOSTIC_EVENT = { type: "diagnostic", action: "send-diagnostic", text: "problem" };
const FIX_EVENT = { type: "diagnostic", action: "fix", text: "repair" };
const cleanups: Array<() => void> = [];

class BrowserEventSource {
  static instances: BrowserEventSource[] = [];
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  close = vi.fn();

  constructor(readonly url: string) {
    BrowserEventSource.instances.push(this);
  }

  emit(value: unknown): void {
    this.emitRaw(JSON.stringify(value));
  }

  emitRaw(data: string): void {
    this.onmessage?.({ data });
  }
}

function subscribe(...args: Parameters<typeof subscribeIdeEvents>): () => void {
  const cleanup = subscribeIdeEvents(...args);
  cleanups.push(cleanup);
  return cleanup;
}

function diagnosticConsumer(sessionId = SESSION_ID) {
  const input = {
    captureInsertion: vi.fn(() => ({ start: 0, end: 0, draftRev: 0 })),
    insertText: vi.fn(() => true),
    persistDraft: vi.fn(),
  };
  const sendFix = vi.fn(async () => {});
  const fallback = vi.fn();
  const cleanup = bindDiagnosticInput(sessionId, input, fallback, sendFix);
  cleanups.push(cleanup);
  return { input, sendFix, fallback, cleanup };
}

beforeEach(() => {
  vi.stubGlobal("EventSource", BrowserEventSource);
});

afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
  BrowserEventSource.instances = [];
  vi.unstubAllGlobals();
});

describe("shared IDE event stream", () => {
  it("shares one encoded-session EventSource between status and diagnostic consumers", () => {
    const status = vi.fn();
    const stopStatus = subscribe(SESSION_ID, "status", status);
    const diagnostics = diagnosticConsumer();
    expect(BrowserEventSource.instances).toHaveLength(1);
    const source = BrowserEventSource.instances[0]!;
    expect(source.url).toBe(`${IDE_EVENTS_URL}?session=session%20%2F%20one`);

    source.emit(CONNECTED_STATUS);
    expect(status).toHaveBeenCalledWith(CONNECTED_STATUS);
    expect(diagnostics.input.insertText).not.toHaveBeenCalled();
    source.emit(DIAGNOSTIC_EVENT);
    expect(diagnostics.input.insertText).toHaveBeenCalledWith("problem", {
      start: 0,
      end: 0,
      draftRev: 0,
    });
    expect(diagnostics.input.persistDraft).toHaveBeenCalledOnce();
    expect(diagnostics.sendFix).not.toHaveBeenCalled();

    stopStatus();
    expect(source.close).not.toHaveBeenCalled();
    source.emit({ ...DIAGNOSTIC_EVENT, text: "still subscribed" });
    expect(diagnostics.input.insertText).toHaveBeenCalledTimes(2);
    diagnostics.cleanup();
    expect(source.close).toHaveBeenCalledOnce();
  });

  it("broadcasts status to every status subscriber without delivering it to diagnostic listeners", () => {
    const first = vi.fn();
    const second = vi.fn();
    const diagnostic = vi.fn();
    subscribe(SESSION_ID, "status", first);
    subscribe(SESSION_ID, "status", second);
    subscribe(SESSION_ID, "diagnostic", diagnostic);
    const source = BrowserEventSource.instances[0]!;
    source.emit(CONNECTED_STATUS);
    expect(first).toHaveBeenCalledExactlyOnceWith(CONNECTED_STATUS);
    expect(second).toHaveBeenCalledExactlyOnceWith(CONNECTED_STATUS);
    expect(diagnostic).not.toHaveBeenCalled();
    source.emit(DIAGNOSTIC_EVENT);
    expect(diagnostic).toHaveBeenCalledExactlyOnceWith(DIAGNOSTIC_EVENT);
    expect(first).toHaveBeenCalledOnce();
    expect(second).toHaveBeenCalledOnce();
  });

  it("delivers each action to only the first mounted diagnostic input and hands off on cleanup", async () => {
    const first = diagnosticConsumer();
    const second = diagnosticConsumer();
    expect(BrowserEventSource.instances).toHaveLength(1);
    const source = BrowserEventSource.instances[0]!;
    source.emit(FIX_EVENT);
    source.emit(DIAGNOSTIC_EVENT);
    await vi.waitFor(() => expect(first.sendFix).toHaveBeenCalledOnce());
    expect(first.input.insertText).toHaveBeenCalledOnce();
    expect(second.sendFix).not.toHaveBeenCalled();
    expect(second.input.captureInsertion).not.toHaveBeenCalled();

    first.cleanup();
    expect(source.close).not.toHaveBeenCalled();
    source.emit(FIX_EVENT);
    source.emit(DIAGNOSTIC_EVENT);
    await vi.waitFor(() => expect(second.sendFix).toHaveBeenCalledOnce());
    expect(first.sendFix).toHaveBeenCalledOnce();
    expect(first.input.insertText).toHaveBeenCalledOnce();
    expect(second.input.insertText).toHaveBeenCalledOnce();
    expect(second.fallback).not.toHaveBeenCalled();
    second.cleanup();
    expect(source.close).toHaveBeenCalledOnce();
  });

  it("keeps distinct sessions on separate sources with independent delivery and cleanup", () => {
    const first = vi.fn();
    const second = vi.fn();
    const stopFirst = subscribe(SESSION_ID, "status", first);
    subscribe(OTHER_SESSION_ID, "status", second);
    expect(BrowserEventSource.instances).toHaveLength(2);
    const [firstSource, secondSource] = BrowserEventSource.instances;
    expect(secondSource!.url).toBe(`${IDE_EVENTS_URL}?session=${OTHER_SESSION_ID}`);
    firstSource!.emit(CONNECTED_STATUS);
    expect(first).toHaveBeenCalledWith(CONNECTED_STATUS);
    expect(second).not.toHaveBeenCalled();
    secondSource!.emit(DISCONNECTED_STATUS);
    expect(second).toHaveBeenCalledWith(DISCONNECTED_STATUS);
    expect(first).toHaveBeenCalledOnce();
    stopFirst();
    expect(firstSource!.close).toHaveBeenCalledOnce();
    expect(secondSource!.close).not.toHaveBeenCalled();
  });

  it("replays only the latest status, never Send or Fix actions to newly mounted consumers", async () => {
    subscribe(SESSION_ID, "status", vi.fn());
    const source = BrowserEventSource.instances[0]!;
    source.emit(CONNECTED_STATUS);
    source.emit(DISCONNECTED_STATUS);
    source.emit(DIAGNOSTIC_EVENT);
    source.emit(FIX_EVENT);

    const lateListener = vi.fn();
    subscribe(SESSION_ID, "status", lateListener);
    const diagnostics = diagnosticConsumer();
    await Promise.resolve();
    expect(BrowserEventSource.instances).toHaveLength(1);
    expect(lateListener).toHaveBeenCalledExactlyOnceWith(DISCONNECTED_STATUS);
    expect(diagnostics.input.captureInsertion).not.toHaveBeenCalled();
    expect(diagnostics.sendFix).not.toHaveBeenCalled();

    source.emit(FIX_EVENT);
    await vi.waitFor(() => expect(diagnostics.sendFix).toHaveBeenCalledOnce());
    expect(diagnostics.sendFix).toHaveBeenCalledWith(SESSION_ID, "repair", expect.any(AbortSignal));
    expect(diagnostics.input.insertText).not.toHaveBeenCalled();
  });

  it("ignores malformed JSON and unknown event classes without replacing cached status", () => {
    const listener = vi.fn();
    subscribe(SESSION_ID, "status", listener);
    const source = BrowserEventSource.instances[0]!;
    source.emit(CONNECTED_STATUS);
    listener.mockClear();
    source.emitRaw("not JSON");
    for (const value of [null, [], 1, true, "status", {}, { type: "ready" }, { type: "unknown" }])
      source.emit(value);
    expect(listener).not.toHaveBeenCalled();
    const lateListener = vi.fn();
    subscribe(SESSION_ID, "status", lateListener);
    expect(lateListener).toHaveBeenCalledExactlyOnceWith(CONNECTED_STATUS);
    source.emit(DIAGNOSTIC_EVENT);
    expect(listener).not.toHaveBeenCalled();
    source.emit(DISCONNECTED_STATUS);
    expect(listener).toHaveBeenCalledExactlyOnceWith(DISCONNECTED_STATUS);
  });

  it("notifies active consumers of errors, clears stale status, and resumes on a fresh status", () => {
    const listener = vi.fn();
    const onError = vi.fn();
    const otherError = vi.fn();
    const stop = subscribe(SESSION_ID, "status", listener, onError);
    subscribe(SESSION_ID, "status", vi.fn(), otherError);
    const source = BrowserEventSource.instances[0]!;
    source.emit(CONNECTED_STATUS);
    listener.mockClear();
    source.onerror?.();
    expect(onError).toHaveBeenCalledOnce();
    expect(otherError).toHaveBeenCalledOnce();
    expect(listener).not.toHaveBeenCalled();
    expect(source.close).not.toHaveBeenCalled();

    const lateListener = vi.fn();
    subscribe(SESSION_ID, "status", lateListener); // Never replay a stale connected pill after failure.
    expect(lateListener).not.toHaveBeenCalled();
    source.emit(DISCONNECTED_STATUS);
    expect(lateListener).toHaveBeenCalledExactlyOnceWith(DISCONNECTED_STATUS);
    const recoveredListener = vi.fn();
    subscribe(SESSION_ID, "status", recoveredListener);
    expect(recoveredListener).toHaveBeenCalledExactlyOnceWith(DISCONNECTED_STATUS);
    stop();
    source.onerror?.();
    expect(onError).toHaveBeenCalledOnce();
    expect(otherError).toHaveBeenCalledTimes(2);
  });

  it("closes exactly once after the final unsubscribe and opens a fresh source on remount", () => {
    const stopFirst = subscribe(SESSION_ID, "status", vi.fn());
    const stopLast = subscribe(SESSION_ID, "diagnostic", vi.fn());
    const source = BrowserEventSource.instances[0]!;
    source.emit(CONNECTED_STATUS);
    stopFirst();
    stopFirst();
    expect(source.close).not.toHaveBeenCalled();
    stopLast();
    stopLast();
    expect(source.close).toHaveBeenCalledOnce();
    expect(source.onmessage).toBeNull();
    expect(source.onerror).toBeNull();

    const freshListener = vi.fn();
    subscribe(SESSION_ID, "status", freshListener);
    expect(BrowserEventSource.instances).toHaveLength(2);
    expect(freshListener).not.toHaveBeenCalled();
    // Calling an old disposer must not close the newly opened session stream.
    stopLast();
    expect(BrowserEventSource.instances[1]!.close).not.toHaveBeenCalled();
    BrowserEventSource.instances[1]!.emit(DISCONNECTED_STATUS);
    expect(freshListener).toHaveBeenCalledExactlyOnceWith(DISCONNECTED_STATUS);
  });

  it("ignores late retained message/error callbacks after cleanup without affecting a new stream", () => {
    const listener = vi.fn();
    const onError = vi.fn();
    const stop = subscribe(SESSION_ID, "status", listener, onError);
    const source = BrowserEventSource.instances[0]!;
    const staleMessage = source.onmessage!;
    const staleError = source.onerror!;
    stop();
    const freshListener = vi.fn();
    subscribe(SESSION_ID, "status", freshListener);
    staleMessage({ data: JSON.stringify(CONNECTED_STATUS) });
    staleMessage({ data: JSON.stringify(FIX_EVENT) });
    staleError();
    expect(listener).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
    expect(freshListener).not.toHaveBeenCalled();
    BrowserEventSource.instances[1]!.emit(DISCONNECTED_STATUS);
    expect(freshListener).toHaveBeenCalledExactlyOnceWith(DISCONNECTED_STATUS);
  });
});
