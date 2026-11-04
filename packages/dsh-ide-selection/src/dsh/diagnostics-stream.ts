// ABOUTME: Classify IDE diagnostic actions for the shared browser event stream.
// ABOUTME: Format insertion context and repair prompts without opening another IDE connection.
import { formatDiagnosticContext, formatDiagnosticFixPrompt } from "../shared/diagnostics.js";
import type { DiagnosticContext } from "../shared/protocol.js";

export interface DiagnosticInputEvent {
  type: "diagnostic";
  action: "send-diagnostic" | "fix";
  text: string;
}

export function diagnosticInputEvent(context: DiagnosticContext): DiagnosticInputEvent {
  const action = context.action ?? "send-diagnostic";
  return {
    type: "diagnostic",
    action,
    text: action === "fix" ? formatDiagnosticFixPrompt(context) : formatDiagnosticContext(context),
  };
}
