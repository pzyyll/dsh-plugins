// ABOUTME: Render the diagnostics receiver and a selectable retry surface for refused edits.
// ABOUTME: Keep successful delivery invisible and localize the retry action.
import { createElement, useEffect, useState, type ReactElement } from "react";
import { bindDiagnosticInput, type InputActions } from "./diagnostics-stream.js";

const PANEL_MAX_HEIGHT_PX = 320;
const PANEL_MAX_VIEWPORT_HEIGHT_VH = 40;
const PANEL_GAP_PX = 8;
const PANEL_Z_INDEX = 1100;

interface PendingDiagnostic {
  id: number;
  text: string;
  retry(): boolean;
  action?: "fix";
  error?: string;
}

/** Invisible SSE receiver with an accessible manual-retry surface for rejected edits. */
export function DiagnosticInput({
  sessionId,
  inputActions,
  sendFix,
  t = (key: string) => key,
}: {
  sessionId?: string;
  inputActions?: InputActions;
  sendFix?: (sessionId: string, text: string, signal: AbortSignal) => Promise<void>;
  t?: (key: string) => string;
}): ReactElement | null {
  const [pending, setPending] = useState<PendingDiagnostic[]>([]);
  useEffect(() => {
    setPending([]);
    if (!sessionId || !inputActions) return undefined;
    let nextId = 0;
    return bindDiagnosticInput(
      sessionId,
      inputActions,
      (text, retry, metadata) => {
        const id = nextId++;
        setPending((items) => [...items, { id, text, retry, ...metadata }]);
      },
      sendFix,
    );
  }, [sessionId, inputActions, sendFix]);
  if (pending.length === 0) return null;
  return createElement(
    "div",
    {
      role: "status",
      "aria-live": "polite",
      style: {
        position: "absolute",
        insetInline: 0,
        bottom: `calc(100% + ${PANEL_GAP_PX}px)`,
        boxSizing: "border-box",
        maxHeight: `min(${PANEL_MAX_VIEWPORT_HEIGHT_VH}vh, ${PANEL_MAX_HEIGHT_PX}px)`,
        overflow: "auto",
        padding: PANEL_GAP_PX,
        border: "1px solid var(--dsw-alias-border-l1)",
        borderRadius: "var(--dsw-radius-lg)",
        background: "var(--dsw-specific-menu)",
        color: "var(--dsw-alias-label-primary)",
        zIndex: PANEL_Z_INDEX,
      },
    },
    ...pending.map((item) =>
      createElement(
        "div",
        { key: item.id },
        createElement("p", { style: { whiteSpace: "pre-wrap", userSelect: "text" } }, item.text),
        item.error ? createElement("p", { role: "alert" }, item.error) : null,
        createElement(
          "button",
          {
            type: "button",
            onClick: () => {
              if (item.retry()) setPending((items) => items.filter(({ id }) => id !== item.id));
            },
          },
          item.action === "fix" ? t("diagnostics.insertFix") : t("diagnostics.retry"),
        ),
      ),
    ),
  );
}
