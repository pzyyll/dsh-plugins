// ABOUTME: Render the diagnostics receiver and a selectable retry surface for refused edits.
// ABOUTME: Keep successful delivery invisible and localize the retry action.
import { createElement, useEffect, useState, type ReactElement } from "react";
import { bindDiagnosticInput, type InputActions } from "./diagnostics-stream.js";

interface PendingDiagnostic {
  id: number;
  text: string;
  retry(): boolean;
}

/** Invisible SSE receiver with an accessible manual-retry surface for rejected edits. */
export function DiagnosticInput({
  sessionId,
  inputActions,
  t = (key: string) => key,
}: {
  sessionId?: string;
  inputActions?: InputActions;
  t?: (key: string) => string;
}): ReactElement | null {
  const [pending, setPending] = useState<PendingDiagnostic[]>([]);
  useEffect(() => {
    setPending([]);
    if (!sessionId || !inputActions) return undefined;
    let nextId = 0;
    return bindDiagnosticInput(sessionId, inputActions, (text, retry) => {
      const id = nextId++;
      setPending((items) => [...items, { id, text, retry }]);
    });
  }, [sessionId, inputActions]);
  if (pending.length === 0) return null;
  return createElement(
    "div",
    { role: "status", "aria-live": "polite" },
    ...pending.map((item) =>
      createElement(
        "div",
        { key: item.id },
        createElement("p", { style: { whiteSpace: "pre-wrap", userSelect: "text" } }, item.text),
        createElement(
          "button",
          {
            type: "button",
            onClick: () => {
              if (item.retry()) setPending((items) => items.filter(({ id }) => id !== item.id));
            },
          },
          t("diagnostics.retry"),
        ),
      ),
    ),
  );
}
