// ABOUTME: Verify Fix uses the published retained-session prompt signature and echo lifecycle.
// ABOUTME: Cover unavailable bindings, cancellation, and request failures without changing drafts.
import { describe, expect, it, vi } from "vitest";
import { sendDiagnosticFix, type DiagnosticFixSessions } from "../../src/client/diagnostic-fix.js";

const SESSION_ID = "requested-session";
const ACTIVE_SESSION_ID = "active-session";
const REQUEST_ID = "diagnostic-fix-request";
const REPAIR_TEXT = "complete repair prompt";
const ACCEPTED_PROMPT = { ok: true as const, value: { accepted: true as const } };

type FixSession = NonNullable<ReturnType<DiagnosticFixSessions["binding"]>>["session"];

function fixture() {
  const abandon = vi.fn();
  const beginSubmission = vi.fn<FixSession["beginSubmission"]>(() => ({
    requestId: REQUEST_ID,
    abandon,
  }));
  const prompt = vi.fn<FixSession["prompt"]>(async () => ACCEPTED_PROMPT);
  const session = { beginSubmission, prompt };
  const sessions: DiagnosticFixSessions = { binding: vi.fn(() => ({ session })) };
  const controller = new AbortController();
  const send = () => sendDiagnosticFix(sessions, SESSION_ID, REPAIR_TEXT, controller.signal);
  return { sessions, session, beginSubmission, prompt, abandon, controller, send };
}

describe("diagnostic Fix routing", () => {
  it("registers an echo before prompt using queue, signal, and the same request id", async () => {
    const { sessions, beginSubmission, prompt, abandon, controller, send } = fixture();
    prompt.mockImplementation(async () => {
      expect(beginSubmission).toHaveBeenCalledOnce();
      return ACCEPTED_PROMPT;
    });

    await expect(send()).resolves.toBeUndefined();

    expect(sessions.binding).toHaveBeenCalledExactlyOnceWith(SESSION_ID);
    expect(beginSubmission).toHaveBeenCalledExactlyOnceWith({
      mode: "queue",
      text: REPAIR_TEXT,
      attachments: [],
    });
    expect(prompt).toHaveBeenCalledExactlyOnceWith(
      [{ type: "text", text: REPAIR_TEXT }],
      "queue",
      controller.signal,
      REQUEST_ID,
    );
    // Acceptance is not durable echo observation; the session owns its eventual retirement.
    expect(abandon).not.toHaveBeenCalled();
  });

  it("targets the retained requested binding rather than the active conversation", async () => {
    const { sessions, session, prompt, send } = fixture();
    const activePrompt = vi.fn<FixSession["prompt"]>();
    const activeSession = { ...session, prompt: activePrompt };
    sessions.binding = vi.fn((id) => ({ session: id === SESSION_ID ? session : activeSession }));

    await send();

    expect(sessions.binding).toHaveBeenCalledExactlyOnceWith(SESSION_ID);
    expect(sessions.binding).not.toHaveBeenCalledWith(ACTIVE_SESSION_ID);
    expect(prompt).toHaveBeenCalledOnce();
    expect(activePrompt).not.toHaveBeenCalled();
  });

  it("rejects a pre-aborted send before resolving a binding or registering an echo", async () => {
    const { sessions, beginSubmission, prompt, controller, send } = fixture();
    controller.abort();

    await expect(send()).rejects.toThrow(/aborted/i);

    expect(sessions.binding).not.toHaveBeenCalled();
    expect(beginSubmission).not.toHaveBeenCalled();
    expect(prompt).not.toHaveBeenCalled();
  });

  it("rejects when the retained session binding is unavailable without acquiring another", async () => {
    const { sessions, beginSubmission, prompt, send } = fixture();
    sessions.binding = vi.fn(() => undefined);

    await expect(send()).rejects.toThrow("session binding");

    expect(sessions.binding).toHaveBeenCalledExactlyOnceWith(SESSION_ID);
    expect(beginSubmission).not.toHaveBeenCalled();
    expect(prompt).not.toHaveBeenCalled();
  });

  it("abandons the echo if cancellation occurs before prompt can be called", async () => {
    const { beginSubmission, prompt, abandon, controller, send } = fixture();
    const reason = new Error("cancelled during echo registration");
    beginSubmission.mockImplementation(() => {
      controller.abort(reason);
      return { requestId: REQUEST_ID, abandon };
    });

    await expect(send()).rejects.toBe(reason);

    expect(prompt).not.toHaveBeenCalled();
    expect(abandon).toHaveBeenCalledOnce();
  });

  it("passes in-flight cancellation to prompt and abandons the failed echo", async () => {
    const { prompt, abandon, controller, send } = fixture();
    const reason = new Error("cancelled during prompt");
    prompt.mockImplementation(
      (_content, _mode, signal) =>
        new Promise<never>((_resolve, reject) => {
          signal!.addEventListener("abort", () => reject(signal!.reason), { once: true });
        }),
    );
    const sending = send();
    controller.abort(reason);

    await expect(sending).rejects.toBe(reason);

    expect(prompt.mock.calls[0]?.[2]).toBe(controller.signal);
    expect(abandon).toHaveBeenCalledOnce();
  });

  it("throws the RemoteResult error itself, preserving its code/details and retiring the echo", async () => {
    const { prompt, abandon, send } = fixture();
    const remoteError = Object.assign(new Error("prompt rejected"), {
      code: "session/not-found",
      details: { sessionId: SESSION_ID },
      isDSHRemoteError: true,
    });
    prompt.mockResolvedValue({ ok: false, error: remoteError });

    await expect(send()).rejects.toBe(remoteError);

    expect(abandon).toHaveBeenCalledOnce();
  });

  it.each(["throw", "reject"] as const)(
    "abandons the echo when prompt fails by %s",
    async (failure) => {
      const { prompt, abandon, send } = fixture();
      const error = new Error("transport failure");
      if (failure === "throw") {
        prompt.mockImplementation(() => {
          throw error;
        });
      } else {
        prompt.mockRejectedValue(error);
      }

      await expect(send()).rejects.toBe(error);

      expect(abandon).toHaveBeenCalledOnce();
    },
  );

  it("does not call prompt if registering the echo fails", async () => {
    const { beginSubmission, prompt, abandon, send } = fixture();
    const error = new Error("ended session");
    beginSubmission.mockImplementation(() => {
      throw error;
    });

    await expect(send()).rejects.toBe(error);

    expect(prompt).not.toHaveBeenCalled();
    expect(abandon).not.toHaveBeenCalled();
  });

  it.each(["accepted", "rejected"] as const)(
    "does not read, send, or modify composer text/attachments when %s",
    async (outcome) => {
      const { sessions, session, prompt, beginSubmission, send } = fixture();
      const draft = Object.freeze({
        text: "unfinished unrelated draft",
        attachments: Object.freeze([Object.freeze({ id: "draft-file", name: "private.txt" })]),
      });
      const readComposer = vi.fn(() => ({ draft }));
      const binding = Object.freeze({
        session,
        // A real binding exposes its scoped services through ctx.get().
        ctx: Object.freeze({ get: readComposer }),
        get composer() {
          return readComposer();
        },
        get conversation() {
          return readComposer();
        },
        get draft() {
          return readComposer();
        },
      });
      sessions.binding = () => binding;
      const error = new Error("prompt rejected");
      if (outcome === "rejected") prompt.mockResolvedValue({ ok: false, error });

      if (outcome === "accepted") await expect(send()).resolves.toBeUndefined();
      else await expect(send()).rejects.toBe(error);

      expect(readComposer).not.toHaveBeenCalled();
      expect(beginSubmission.mock.calls[0]?.[0].attachments).toEqual([]);
      expect(prompt.mock.calls[0]?.[0]).toEqual([{ type: "text", text: REPAIR_TEXT }]);
      expect(draft).toEqual({
        text: "unfinished unrelated draft",
        attachments: [{ id: "draft-file", name: "private.txt" }],
      });
    },
  );
});
