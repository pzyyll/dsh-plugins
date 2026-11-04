// ABOUTME: Keep the IDE status visible and open a compact composer-style target picker.
// ABOUTME: Reuse the slash command's target API while native popovers handle light dismissal.
import {
  createElement,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
} from "react";
import { Tooltip } from "@deepseek-ai/dsh-client-ui-primitives";
import type { IdeTargetOverview } from "../shared/target.js";
import { pickerOptions, type PickerOption } from "./picker-options.js";
import { PICKER_MARGIN_PX, pickerPosition } from "./picker-position.js";
import { applyTargetChoice, loadTargetOverview, type Translate } from "./targets.js";

/** Keep the IDE pill after the built-in statistics and subscription usage. */
export const STATUS_ORDER = 1000;
const DISCONNECTED_OPACITY = 0.45;
const TOOLTIP_DELAY_MS = 200;
const PICKER_WIDTH_PX = 320;
const PICKER_MAX_HEIGHT_PX = 400;
const PICKER_Z_INDEX = 1100;
const VIEWPORT_INSET_PX = PICKER_MARGIN_PX * 2;
const PICKER_SPACING_PX = 8;
const PICKER_HEADING_INSET_PX = 4;
const PICKER_FONT_SIZE_PX = 13;
const PICKER_SECONDARY_FONT_SIZE_PX = 12;
const PICKER_LINE_HEIGHT_PX = 20;
const PICKER_DETAIL_LINE_HEIGHT_PX = 18;
const PICKER_FOCUS_WIDTH_PX = 2;

/** Match the context meter's surface, elevation, typography, and trigger skin. */
export const STATUS_PILL_CSS = [
  `[data-composer-stat="ide-selection"]{display:inline-flex;order:${STATUS_ORDER};min-width:0;font-size:calc(var(--dsh-content-font-size-secondary, 13px) - 1px);line-height:calc(20px + var(--dsh-content-font-delta-secondary, 0px))}`,
  ".dsh-ide-trigger{display:inline-flex;align-items:center;box-sizing:border-box;max-width:100%;padding:1px 8px;border:none;border-radius:var(--dsw-radius-sm);background:transparent;color:var(--dsw-alias-label-tertiary);font:inherit;font-variant-numeric:tabular-nums;line-height:inherit;white-space:nowrap;cursor:pointer}",
  `.dsh-ide-trigger[data-connected="false"]{opacity:${DISCONNECTED_OPACITY}}`,
  '.dsh-ide-trigger:hover,.dsh-ide-trigger[aria-expanded="true"]{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}',
  `.dsh-ide-picker{position:fixed;inset:auto;margin:0;z-index:${PICKER_Z_INDEX};box-sizing:border-box;width:min(${PICKER_WIDTH_PX}px,calc(100vw - ${VIEWPORT_INSET_PX}px));max-height:min(${PICKER_MAX_HEIGHT_PX}px,calc(100dvh - ${VIEWPORT_INSET_PX}px));overflow-y:auto;padding:${PICKER_SPACING_PX}px;border:0;border-radius:var(--dsw-radius-lg);background:var(--dsw-specific-menu);backdrop-filter:var(--dsw-menu-backdrop-filter);--dsw-elevation-stroke-color:var(--dsw-alias-border-l1);box-shadow:var(--dsw-elevation-prominent);color:var(--dsw-alias-label-secondary);font-family:inherit;font-size:${PICKER_FONT_SIZE_PX}px;line-height:${PICKER_LINE_HEIGHT_PX}px}`,
  `.dsh-ide-picker-title{margin:0;padding:${PICKER_HEADING_INSET_PX}px ${PICKER_SPACING_PX}px ${PICKER_SPACING_PX}px;color:var(--dsw-alias-label-primary);font:inherit;font-weight:500}`,
  `.dsh-ide-picker-message{margin:0;padding:0 ${PICKER_SPACING_PX}px ${PICKER_HEADING_INSET_PX}px;color:var(--dsw-alias-label-tertiary);font:inherit;font-size:${PICKER_SECONDARY_FONT_SIZE_PX}px}`,
  ".dsh-ide-picker-message{overflow-wrap:anywhere}",
  `.dsh-ide-picker-option,.dsh-ide-picker-retry{display:flex;align-items:flex-start;box-sizing:border-box;gap:${PICKER_SPACING_PX}px;width:100%;padding:${PICKER_SPACING_PX}px;border:0;border-radius:var(--dsw-radius-sm);background:transparent;color:var(--dsw-alias-label-primary);font:inherit;text-align:start;cursor:pointer}`,
  '.dsh-ide-picker-option[aria-pressed="true"],.dsh-ide-picker-option:not(:disabled):hover,.dsh-ide-picker-retry:hover{background:var(--dsw-alias-interactive-bg-hover)}',
  `.dsh-ide-picker-option:focus-visible,.dsh-ide-picker-retry:focus-visible{outline:${PICKER_FOCUS_WIDTH_PX}px solid var(--dsw-alias-label-secondary);outline-offset:-${PICKER_FOCUS_WIDTH_PX}px}`,
  ".dsh-ide-picker-option:disabled{opacity:0.5}",
  ".dsh-ide-picker-option:disabled.dsh-ide-picker-option-unavailable{cursor:not-allowed}",
  ".dsh-ide-picker-option:disabled.dsh-ide-picker-option-pending{cursor:wait}",
  ".dsh-ide-picker-option-copy{flex:1;min-width:0}",
  ".dsh-ide-picker-option-label,.dsh-ide-picker-option-detail{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
  `.dsh-ide-picker-option-detail{color:var(--dsw-alias-label-tertiary);font-size:${PICKER_SECONDARY_FONT_SIZE_PX}px;line-height:${PICKER_DETAIL_LINE_HEIGHT_PX}px}`,
  `.dsh-ide-picker-option-connected{flex-shrink:0;color:var(--dsw-alias-label-secondary);font-size:${PICKER_SECONDARY_FONT_SIZE_PX}px;line-height:${PICKER_LINE_HEIGHT_PX}px}`,
].join("");

interface IdeStatusProps {
  sessionId: string | undefined;
  connected: boolean;
  label: string;
  detail: string;
  t: Translate;
}

/** One status button and its native, non-modal, viewport-kept popup. */
export function IdeStatusControl({
  sessionId,
  connected,
  label,
  detail,
  t,
}: IdeStatusProps): ReactElement {
  const id = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const signalRef = useRef<AbortSignal | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const [overview, setOverview] = useState<IdeTargetOverview | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const [pending, setPending] = useState<string | undefined>(undefined);
  const [retry, setRetry] = useState(0);
  const [position, setPosition] = useState<CSSProperties | undefined>(undefined);

  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!panel) return undefined;
    // The host's React version does not forward div popover toggle events.
    const onToggle = () => setOpen(panel.matches(":popover-open"));
    panel.addEventListener("toggle", onToggle);
    return () => panel.removeEventListener("toggle", onToggle);
  }, []);

  useEffect(() => {
    if (!open || !sessionId) return undefined;
    const controller = new AbortController();
    signalRef.current = controller.signal;
    setOverview(undefined);
    setError(undefined);
    setPending(undefined);
    void loadTargetOverview(sessionId, controller.signal, t).then(
      (value) => {
        if (!controller.signal.aborted) setOverview(value);
      },
      (cause: unknown) => {
        if (!controller.signal.aborted) setError(errorText(cause, t("error.list")));
      },
    );
    return () => {
      controller.abort();
      signalRef.current = undefined;
    };
  }, [open, sessionId, retry, t]);

  useLayoutEffect(() => {
    if (!open) {
      setPosition(undefined);
      return undefined;
    }
    const anchor = triggerRef.current;
    const panel = panelRef.current;
    if (!anchor || !panel) return undefined;
    const update = () => {
      setPosition(
        pickerPosition(anchor.getBoundingClientRect(), panel.getBoundingClientRect(), {
          width: window.innerWidth,
          height: window.innerHeight,
        }),
      );
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(anchor);
    observer.observe(panel);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open]);

  const positioned = position !== undefined;
  useLayoutEffect(() => {
    if (open && positioned) panelRef.current?.focus({ preventScroll: true });
  }, [open, positioned]);

  const choose = async (option: PickerOption) => {
    const signal = signalRef.current;
    if (option.disabled || !sessionId || !signal || signal.aborted || pending !== undefined) return;
    setPending(option.id);
    setError(undefined);
    try {
      await applyTargetChoice(sessionId, option.targetId, t, signal);
      if (!signal.aborted) {
        panelRef.current?.hidePopover();
        triggerRef.current?.focus({ preventScroll: true });
      }
    } catch (cause) {
      if (!signal.aborted) setError(errorText(cause, t("error.choice")));
    } finally {
      if (!signal.aborted) setPending(undefined);
    }
  };

  const options = overview === undefined ? [] : pickerOptions(overview, t, connected);
  const button = createElement(
    "button",
    {
      ref: triggerRef,
      type: "button",
      className: "dsh-ide-trigger",
      "data-connected": connected,
      "aria-label": `${detail} — ${t("picker.title")}`,
      "aria-haspopup": "dialog",
      "aria-expanded": open,
      "aria-controls": id,
      popoverTarget: id,
    },
    label,
  );
  return createElement(
    "span",
    { "data-composer-stat": "ide-selection" },
    createElement(
      Tooltip,
      { label: detail, side: "top", delayMs: TOOLTIP_DELAY_MS, portal: true, disabled: open },
      button,
    ),
    createElement(
      "div",
      {
        id,
        ref: panelRef,
        popover: "auto",
        role: "dialog",
        tabIndex: -1,
        "aria-label": t("picker.title"),
        className: "dsh-ide-picker",
        style: position ?? { visibility: "hidden" },
      },
      createElement("h2", { className: "dsh-ide-picker-title" }, t("picker.title")),
      !sessionId
        ? createElement("p", { className: "dsh-ide-picker-message" }, t("picker.session"))
        : overview === undefined && error === undefined
          ? createElement(
              "p",
              { className: "dsh-ide-picker-message", role: "status" },
              t("picker.loading"),
            )
          : null,
      error === undefined
        ? null
        : createElement("p", { className: "dsh-ide-picker-message", role: "alert" }, error),
      error !== undefined && overview === undefined
        ? createElement(
            "button",
            {
              type: "button",
              className: "dsh-ide-picker-retry",
              onClick: () => setRetry((revision) => revision + 1),
            },
            t("picker.retry"),
          )
        : null,
      overview?.ides.every((ide) => !ide.workspaceMatched)
        ? createElement("p", { className: "dsh-ide-picker-message" }, t("picker.empty"))
        : null,
      ...options.map((option) =>
        createElement(
          "button",
          {
            key: option.id,
            type: "button",
            className: [
              "dsh-ide-picker-option",
              option.disabled ? "dsh-ide-picker-option-unavailable" : "",
              pending === option.id ? "dsh-ide-picker-option-pending" : "",
            ]
              .filter(Boolean)
              .join(" "),
            "aria-pressed": option.active ?? false,
            "aria-description": option.title,
            title: option.title,
            disabled: option.disabled === true || pending !== undefined,
            onClick: () => void choose(option),
          },
          createElement(
            "span",
            { className: "dsh-ide-picker-option-copy" },
            createElement("span", { className: "dsh-ide-picker-option-label" }, option.label),
            option.detail
              ? createElement("span", { className: "dsh-ide-picker-option-detail" }, option.detail)
              : null,
          ),
          option.active
            ? createElement(
                "span",
                { className: "dsh-ide-picker-option-connected" },
                t("picker.connected"),
              )
            : null,
        ),
      ),
    ),
  );
}

function errorText(cause: unknown, fallback: string): string {
  return cause instanceof Error ? cause.message : fallback;
}
