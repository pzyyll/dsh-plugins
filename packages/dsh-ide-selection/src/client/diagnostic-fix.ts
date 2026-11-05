// ABOUTME: Route a browser Fix action through the retained session-scoped prompt API.
// ABOUTME: Register the UI's pending echo without touching the composer draft or attachments.

const DIAGNOSTIC_FIX_MODE = "queue" as const;
const ABORTED_FIX_ERROR = "Diagnostic fix was aborted";
const UNAVAILABLE_SESSION_ERROR = "The session binding is unavailable";

interface DiagnosticFixTextPart {
  type: "text";
  text: string;
}

interface DiagnosticFixSubmissionHandle {
  readonly requestId: string;
  abandon(): void;
}

interface DiagnosticFixSession {
  beginSubmission(input: {
    mode: typeof DIAGNOSTIC_FIX_MODE;
    text: string;
    attachments: readonly [];
  }): DiagnosticFixSubmissionHandle;
  prompt(
    content: DiagnosticFixTextPart[],
    mode: typeof DIAGNOSTIC_FIX_MODE,
    signal?: AbortSignal,
    requestId?: string,
  ): Promise<{ ok: true; value: { accepted: true } } | { ok: false; error: Error }>;
}

interface DiagnosticFixBinding {
  readonly session: DiagnosticFixSession;
}

/** Structural slice of dsh 0.2.2-rc.1's public ISessions/ISession contract. */
export interface DiagnosticFixSessions {
  binding(sessionId: string): DiagnosticFixBinding | undefined;
}

/** Queue a repair prompt on the retained session without changing composer state. */
export async function sendDiagnosticFix(
  sessions: DiagnosticFixSessions,
  sessionId: string,
  text: string,
  signal: AbortSignal,
): Promise<void> {
  if (signal.aborted) throw new Error(ABORTED_FIX_ERROR);

  const session = sessions.binding(sessionId)?.session;
  if (!session) throw new Error(UNAVAILABLE_SESSION_ERROR);

  const content: DiagnosticFixTextPart[] = [{ type: "text", text }];
  // Match the conversation's pending user-message echo, but never submit its draft attachments.
  const submission = session.beginSubmission({
    mode: DIAGNOSTIC_FIX_MODE,
    text,
    attachments: [],
  });

  try {
    signal.throwIfAborted();
    const result = await session.prompt(content, DIAGNOSTIC_FIX_MODE, signal, submission.requestId);
    if (!result.ok) throw result.error;
  } catch (error) {
    // prompt retires RemoteResult failures itself; abandon is idempotent and also covers throws.
    submission.abandon();
    throw error;
  }
}
