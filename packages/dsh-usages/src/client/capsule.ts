// ABOUTME: Floating usage capsule docked to the content edge.
// ABOUTME: It shows one amount and opens the existing detail panel.

import {
  createElement,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactElement,
} from "react";
import {
  formatPercent,
  type MoneyPart,
  type OpencodeWindowId,
  type Translate,
  type UsageChannel,
  type UsageSnapshot,
  type WindowChip,
} from "../shared/model.js";
import type { UsageState } from "./store.js";
import { usageState } from "./store.js";

const EDGE_MARGIN_PX = 12;
const CAPSULE_HEIGHT_PX = 32;
const CAPSULE_MIN_WIDTH_PX = 48;
const RING_SIZE_PX = 32;
const CORNER_RADIUS_PX = 12.8;
const DRAG_THRESHOLD_PX = 4;
const INITIAL_FRACTION = 0.5;
const DOCK_TRAVEL_MS = 220;
const DOCK_JELLY_MS = 480;
const DOCK_TRAVEL_EASING = "cubic-bezier(0.22,1,0.36,1)";
const DOCK_IMPACT_OFFSET = DOCK_TRAVEL_MS / DOCK_JELLY_MS;
const DOCK_REBOUND_OFFSET = 0.7;
const DOCK_SETTLE_OFFSET = 0.86;

interface ContentBounds {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
  readonly hidden: boolean;
}

interface Dock {
  readonly edge: "left" | "right";
  readonly fraction: number;
}

interface Point {
  readonly x: number;
  readonly y: number;
}

interface Drag {
  id: number;
  startX: number;
  startY: number;
  offsetX: number;
  offsetY: number;
  moved: boolean;
  point: Point;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** The main column is the sibling before the right-bar marker. Do not use generated class names. */
function useContentBounds(
  rootRef: { readonly current: HTMLElement | null },
  visible: boolean,
): ContentBounds | null {
  const [bounds, setBounds] = useState<ContentBounds | null>(null);
  useLayoutEffect(() => {
    if (!visible) return undefined;
    const frame = rootRef.current?.closest("[data-shell-overlay]")?.parentElement;
    const center = frame?.querySelector("[data-rightbar-col]")?.previousElementSibling;
    if (frame === undefined || frame === null || !(center instanceof HTMLElement)) {
      return undefined;
    }
    const measure = () => {
      const rect = center.getBoundingClientRect();
      const node = rootRef.current;
      const width =
        node === null || node.offsetWidth === 0 ? CAPSULE_MIN_WIDTH_PX : node.offsetWidth;
      const height =
        node === null || node.offsetHeight === 0 ? CAPSULE_HEIGHT_PX : node.offsetHeight;
      const top = rect.top + EDGE_MARGIN_PX;
      const bottom = rect.bottom - EDGE_MARGIN_PX - height;
      const right = rect.right - width;
      const hidden =
        center.inert ||
        frame.hasAttribute("data-rightbar-fullscreen") ||
        right < rect.left ||
        bottom < top;
      const next = { left: rect.left, right, top, bottom, hidden };
      setBounds((previous) =>
        previous !== null &&
        previous.left === next.left &&
        previous.right === next.right &&
        previous.top === next.top &&
        previous.bottom === next.bottom &&
        previous.hidden === next.hidden
          ? previous
          : next,
      );
    };
    measure();
    const resize = new ResizeObserver(measure);
    resize.observe(center);
    resize.observe(frame);
    const root = rootRef.current;
    if (root !== null) resize.observe(root);
    const mutation = new MutationObserver(measure);
    mutation.observe(frame, { attributes: true });
    mutation.observe(center, { attributes: true, attributeFilter: ["inert"] });
    window.addEventListener("resize", measure);
    return () => {
      resize.disconnect();
      mutation.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [rootRef, visible]);
  return bounds;
}

/** What the old sidebar row drew, without the channel name beside it. */
export type CapsuleFace =
  | { readonly kind: "ring"; readonly windows: readonly WindowChip[] }
  | { readonly kind: "money"; readonly parts: readonly MoneyPart[] }
  | { readonly kind: "status"; readonly value: string };

function mark(): ReactElement {
  return createElement(
    "svg",
    {
      "data-dsh-usages-mark": "",
      viewBox: "7.3 8.8 21.4 21.4",
      width: 16,
      height: 16,
      "aria-hidden": true,
    },
    createElement("path", {
      d: "M8 24.5a10 10 0 1 1 20 0",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": "1.4",
      "stroke-linecap": "round",
    }),
    createElement("path", {
      d: "M18 24.5 24 15",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": "1.3",
      "stroke-linecap": "round",
    }),
  );
}

function moneyLead(parts: readonly MoneyPart[]): ReactElement {
  return createElement(
    "span",
    { "data-dsh-usages-money": "" },
    parts.map((part, index) =>
      createElement(
        "span",
        { "data-dsh-usages-pill": "", key: `${part.symbol}-${index}` },
        part.symbol === ""
          ? null
          : createElement("span", { "data-dsh-usages-pill-symbol": "" }, part.symbol),
        createElement("span", { "data-dsh-usages-pill-amount": "" }, part.amount),
      ),
    ),
  );
}

const RING_CENTER = 18;
const RING_RADIUS = 13.6;
const RING_STROKE = 2.6;
const RING_GAP = 22;
/** Tight on the stroke so a 42px box is the ring, not the old padded viewBox. */
const RING_OUTER = RING_RADIUS + RING_STROKE / 2;
const RING_VIEWBOX = `${RING_CENTER - RING_OUTER} ${RING_CENTER - RING_OUTER} ${RING_OUTER * 2} ${RING_OUTER * 2}`;
/**
 * Upper half is the 5-hour window; the lower half splits into a week quarter on the
 * left and a month quarter on the right. Twelve o'clock is 0, so the top arc runs
 * from 270 through 0 to 90. These are the spans only; the fill always starts at the
 * end with the smaller x, which is what keeps every segment draining right to left.
 */
const RING_SPANS: Readonly<
  Record<OpencodeWindowId, { readonly from: number; readonly to: number }>
> = {
  rolling: { from: 270, to: 450 },
  weekly: { from: 180, to: 270 },
  monthly: { from: 90, to: 180 },
};

function ringPoint(angle: number): { readonly x: number; readonly y: number } {
  const radians = ((angle - 90) * Math.PI) / 180;
  return {
    x: RING_CENTER + RING_RADIUS * Math.cos(radians),
    y: RING_CENTER + RING_RADIUS * Math.sin(radians),
  };
}

/**
 * The arc on the ring circle. Both flags describe the real geometry, so the renderer
 * keeps the ring centre instead of solving for the mirrored one on a reversed span.
 */
function arcPath(from: number, to: number): string {
  const start = ringPoint(from);
  const end = ringPoint(to);
  const large = Math.abs(to - from) > 180 ? 1 : 0;
  const sweep = to > from ? 1 : 0;
  return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${RING_RADIUS} ${RING_RADIUS} 0 ${large} ${sweep} ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
}

function closedRing(
  window: WindowChip,
  size: number,
  ref: { readonly current: SVGSVGElement | null },
  hovered: string | null,
  onHover: (window: WindowChip) => void,
  onLeave: () => void,
): ReactElement {
  const remaining = Math.min(100, Math.max(0, window.remainingPercent));
  const circle = { cx: RING_CENTER, cy: RING_CENTER, r: RING_RADIUS, "stroke-width": RING_STROKE };
  const full = remaining <= 0 || remaining >= 100;
  return createElement(
    "svg",
    {
      ref,
      "data-dsh-usages-ring": "",
      "data-closed": "true",
      "data-hovering": hovered === null ? "false" : "true",
      viewBox: RING_VIEWBOX,
      width: size,
      height: size,
      "aria-hidden": true,
    },
    createElement("rect", {
      key: "hub",
      "data-role": "hub",
      x: RING_CENTER - 4.8,
      y: RING_CENTER - 4.8,
      width: 9.6,
      height: 9.6,
      rx: 2.2,
      transform: `rotate(45 ${RING_CENTER} ${RING_CENTER})`,
    }),
    createElement(
      "g",
      { "data-dsh-usages-segment": "", "data-hover": hovered === window.id ? "true" : "false" },
      createElement("circle", { ...circle, key: "track", "data-role": "track" }),
      remaining <= 0
        ? null
        : createElement("circle", {
            ...circle,
            key: "fill",
            "data-role": "fill",
            "data-level": window.level,
            pathLength: 100,
            ...(full
              ? {}
              : {
                  "stroke-dasharray": `${remaining} ${100 - remaining}`,
                  "stroke-dashoffset": remaining,
                }),
            transform: `rotate(-90 ${RING_CENTER} ${RING_CENTER})`,
          }),
    ),
    createElement("circle", {
      ...circle,
      key: "hit",
      "data-role": "hit",
      "stroke-width": 10,
      onPointerEnter: () => {
        onHover(window);
      },
      onPointerLeave: onLeave,
    }),
  );
}

function windowRing(
  windows: readonly WindowChip[],
  size: number,
  ref: { readonly current: SVGSVGElement | null },
  hovered: string | null,
  onHover: (window: WindowChip) => void,
  onLeave: () => void,
): ReactElement {
  const only = windows.length === 1 ? windows[0] : undefined;
  if (only !== undefined) return closedRing(only, size, ref, hovered, onHover, onLeave);
  const even = 360 / windows.length;
  return createElement(
    "svg",
    {
      ref,
      "data-dsh-usages-ring": "",
      "data-hovering": hovered === null ? "false" : "true",
      viewBox: RING_VIEWBOX,
      width: size,
      height: size,
      "aria-hidden": true,
    },
    createElement("rect", {
      key: "hub",
      "data-role": "hub",
      x: RING_CENTER - 4.8,
      y: RING_CENTER - 4.8,
      width: 9.6,
      height: 9.6,
      rx: 2.2,
      transform: `rotate(45 ${RING_CENTER} ${RING_CENTER})`,
    }),
    windows.flatMap((window, index) => {
      const known =
        window.id === "rolling" || window.id === "weekly" || window.id === "monthly"
          ? RING_SPANS[window.id]
          : undefined;
      const span = known ?? { from: index * even, to: (index + 1) * even };
      const head = span.from + RING_GAP / 2;
      const tail = span.to - RING_GAP / 2;
      /* Anchor every segment at its left end, so all of them drain from right to left. */
      const from = ringPoint(head).x <= ringPoint(tail).x ? head : tail;
      const to = from === head ? tail : head;
      const fraction = Math.min(1, Math.max(0, window.remainingPercent / 100));
      const fillTo = from + (to - from) * fraction;
      const drawn = [
        createElement("path", {
          key: `${window.id}-track`,
          "data-role": "track",
          d: arcPath(from, to),
          "stroke-width": RING_STROKE,
        }),
      ];
      if (fraction > 0) {
        drawn.push(
          createElement("path", {
            key: `${window.id}-fill`,
            "data-role": "fill",
            "data-level": window.level,
            d: arcPath(from, fillTo),
            "stroke-width": RING_STROKE,
          }),
        );
      }
      return [
        createElement(
          "g",
          {
            key: window.id,
            "data-dsh-usages-segment": "",
            "data-hover": hovered === window.id ? "true" : "false",
          },
          drawn,
        ),
        createElement("path", {
          key: `${window.id}-hit`,
          "data-role": "hit",
          d: arcPath(from, to),
          onPointerEnter: () => {
            onHover(window);
          },
          onPointerLeave: onLeave,
        }),
      ];
    }),
  );
}

export function UsageCapsule(props: {
  readonly usage: UsageState;
  readonly t: Translate;
  readonly face: CapsuleFace | null;
  readonly label: string;
  readonly pending: boolean;
  readonly channels: readonly string[];
  readonly requestUsage: (
    refresh: boolean,
    channels: readonly UsageChannel[],
    quiet?: boolean,
  ) => void;
  readonly closeUsage: (restoreFocus?: boolean) => void;
  readonly setOpen: (anchor: { left: number; top: number; right: number; bottom: number }) => void;
  readonly trackedChannels: (snapshot: UsageSnapshot | null) => readonly string[];
  readonly spinner: () => ReactElement;
  readonly pollMs: number;
}): ReactElement | null {
  const { usage, t, face, pending } = props;
  const channelKey = props.channels.join("\0");
  const shown = pending || face !== null;
  const rootRef = useRef<HTMLSpanElement | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const suppressClickRef = useRef(false);
  const pendingDockRef = useRef<Point | null>(null);
  const dockAnimationsRef = useRef<Animation[]>([]);
  const ringRef = useRef<SVGSVGElement | null>(null);
  const tipRef = useRef<HTMLSpanElement | null>(null);
  const [dock, setDock] = useState<Dock>({ edge: "left", fraction: INITIAL_FRACTION });
  const [point, setPoint] = useState<Point | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [tip, setTip] = useState<{
    readonly text: string;
    readonly left: number;
    readonly top: number;
  } | null>(null);
  const bounds = useContentBounds(rootRef, shown);
  const anchorName = `--dsh-usages-${useId().replaceAll(":", "")}`;
  const interactive = face !== null && bounds !== null && !bounds.hidden;
  const placement =
    bounds === null
      ? { visibility: "hidden" as const, left: 0, top: 0 }
      : {
          visibility: (bounds.hidden ? "hidden" : "visible") as "hidden" | "visible",
          left: point
            ? clamp(point.x, bounds.left, bounds.right)
            : dock.edge === "left"
              ? bounds.left
              : bounds.right,
          top: point
            ? clamp(point.y, bounds.top, bounds.bottom)
            : bounds.top + dock.fraction * (bounds.bottom - bounds.top),
        };

  useEffect(() => {
    const list = channelKey === "" ? [] : channelKey.split("\0");
    const load = (refresh: boolean, quiet: boolean) => {
      if (globalThis.document?.hidden) return;
      props.requestUsage(refresh, list, quiet);
    };
    load(false, false);
    const timer = setInterval(() => {
      load(true, true);
    }, props.pollMs);
    const onVisible = () => {
      if (!globalThis.document?.hidden) props.requestUsage(false, list);
    };
    globalThis.document?.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      globalThis.document?.removeEventListener("visibilitychange", onVisible);
    };
    // The request function is a stable module binding. Depending on `props` would refetch every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelKey, props.pollMs, props.requestUsage]);

  useLayoutEffect(() => {
    const from = pendingDockRef.current;
    pendingDockRef.current = null;
    if (from === null || point !== null || !interactive) return undefined;
    const root = rootRef.current;
    const trigger = root?.querySelector("button");
    const motion = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (
      motion?.matches === true ||
      root === null ||
      root === undefined ||
      trigger === null ||
      trigger === undefined ||
      typeof root.animate !== "function" ||
      typeof trigger.animate !== "function"
    ) {
      return undefined;
    }
    const corner = `${CORNER_RADIUS_PX}px`;
    const dockedCorners =
      dock.edge === "left" ? `0 ${corner} ${corner} 0` : `${corner} 0 0 ${corner}`;
    const dockBorder = dock.edge === "left" ? "borderLeftColor" : "borderRightColor";
    const borderColor = window.getComputedStyle(trigger).borderTopColor;
    const origin = `${dock.edge} center`;
    const animations = [
      root.animate(
        [
          { transform: `translate(${from.x - placement.left}px,${from.y - placement.top}px)` },
          { transform: "translate(0px,0px)" },
        ],
        { duration: DOCK_TRAVEL_MS, easing: DOCK_TRAVEL_EASING },
      ),
      trigger.animate(
        [
          { offset: 0, transform: "scale(1,1)", borderRadius: corner, [dockBorder]: borderColor },
          {
            offset: DOCK_IMPACT_OFFSET,
            transform: "scale(0.88,1.08)",
            borderRadius: dockedCorners,
            [dockBorder]: "transparent",
          },
          {
            offset: DOCK_REBOUND_OFFSET,
            transform: "scale(1.06,0.96)",
            borderRadius: dockedCorners,
            [dockBorder]: "transparent",
          },
          {
            offset: DOCK_SETTLE_OFFSET,
            transform: "scale(0.98,1.02)",
            borderRadius: dockedCorners,
            [dockBorder]: "transparent",
          },
          {
            offset: 1,
            transform: "scale(1,1)",
            borderRadius: dockedCorners,
            [dockBorder]: "transparent",
          },
        ].map((frame) => ({ ...frame, transformOrigin: origin })),
        { duration: DOCK_JELLY_MS, easing: "ease-in-out" },
      ),
    ];
    dockAnimationsRef.current = animations;
    const cancel = () => {
      for (const animation of animations) animation.cancel();
      dockAnimationsRef.current = [];
    };
    const onMotionChange = (event: MediaQueryListEvent) => {
      if (event.matches) cancel();
    };
    motion?.addEventListener("change", onMotionChange);
    return () => {
      motion?.removeEventListener("change", onMotionChange);
      cancel();
    };
  }, [dock, point, bounds, interactive, placement.left, placement.top]);

  useEffect(() => {
    if (!interactive && usage.open) props.closeUsage(false);
  }, [interactive, usage.open, props.closeUsage]);

  useLayoutEffect(() => {
    const node = tipRef.current;
    if (node === null || tip === null) return;
    const box = node.getBoundingClientRect();
    const half = box.width / 2;
    const margin = 8;
    const highest = margin + half;
    const center = Math.min(
      Math.max(tip.left, highest),
      Math.max(highest, window.innerWidth - margin - half),
    );
    const bottom = Math.max(margin + box.height, tip.top);
    const dx = center - (box.left + half);
    const dy = bottom - box.bottom;
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;
    setTip({ ...tip, left: tip.left + dx, top: tip.top + dy });
  }, [tip]);

  if (!shown) return null;

  const label = props.label;
  const move = (event: { pointerId: number; clientX: number; clientY: number }) => {
    const drag = dragRef.current;
    if (drag === null || drag.id !== event.pointerId || bounds === null) return;
    if (
      !drag.moved &&
      Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < DRAG_THRESHOLD_PX
    ) {
      return;
    }
    if (!drag.moved) {
      props.closeUsage(false);
      setHovered(null);
      setTip(null);
    }
    drag.moved = true;
    drag.point = {
      x: clamp(event.clientX - drag.offsetX, bounds.left, bounds.right),
      y: clamp(event.clientY - drag.offsetY, bounds.top, bounds.bottom),
    };
    setPoint(drag.point);
  };
  const finish = (event: {
    pointerId: number;
    currentTarget: EventTarget & {
      hasPointerCapture(id: number): boolean;
      releasePointerCapture(id: number): void;
    };
  }) => {
    const drag = dragRef.current;
    if (drag === null || drag.id !== event.pointerId) return;
    dragRef.current = null;
    if (drag.moved && bounds !== null) {
      const { x, y } = drag.point;
      pendingDockRef.current = {
        x: clamp(x, bounds.left, bounds.right),
        y: clamp(y, bounds.top, bounds.bottom),
      };
      setDock({
        edge: x - bounds.left < bounds.right - x ? "left" : "right",
        fraction:
          bounds.bottom === bounds.top
            ? INITIAL_FRACTION
            : clamp((y - bounds.top) / (bounds.bottom - bounds.top), 0, 1),
      });
      suppressClickRef.current = true;
    }
    setPoint(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };
  const trigger =
    face === null
      ? createElement(
          "span",
          { "data-dsh-usages-trigger": "", role: "status", "aria-label": label },
          props.spinner(),
        )
      : createElement(
          "button",
          {
            type: "button",
            "data-dsh-usages-trigger": "",
            "aria-haspopup": "dialog",
            "aria-expanded": usage.open,
            "aria-label": label,
            "aria-busy": usage.pending,
            onPointerDown: (event: {
              button: number;
              isPrimary: boolean;
              pointerId: number;
              clientX: number;
              clientY: number;
              currentTarget: EventTarget & { setPointerCapture(id: number): void };
            }) => {
              if (event.button !== 0 || !event.isPrimary || bounds === null) return;
              for (const animation of dockAnimationsRef.current) animation.cancel();
              dockAnimationsRef.current = [];
              suppressClickRef.current = false;
              dragRef.current = {
                id: event.pointerId,
                startX: event.clientX,
                startY: event.clientY,
                offsetX: event.clientX - placement.left,
                offsetY: event.clientY - placement.top,
                moved: false,
                point: { x: placement.left, y: placement.top },
              };
              event.currentTarget.setPointerCapture(event.pointerId);
            },
            onPointerMove: move,
            onPointerUp: finish,
            onPointerCancel: finish,
            onLostPointerCapture: finish,
            onClick: (event: { detail: number; currentTarget: HTMLButtonElement }) => {
              if (suppressClickRef.current && event.detail !== 0) {
                suppressClickRef.current = false;
                return;
              }
              if (usage.open) {
                props.closeUsage(false);
                return;
              }
              const rect = event.currentTarget.getBoundingClientRect();
              props.setOpen({
                left: rect.left,
                top: rect.top,
                right: rect.right,
                bottom: rect.bottom,
              });
              props.requestUsage(false, props.trackedChannels(usageState().snapshot));
            },
          },
          face === null
            ? props.spinner()
            : face.kind === "ring"
              ? windowRing(
                  face.windows,
                  RING_SIZE_PX,
                  ringRef,
                  hovered,
                  (window) => {
                    setHovered(window.id);
                    const rect = ringRef.current?.getBoundingClientRect();
                    if (rect === undefined) return;
                    setTip({
                      text: `${window.name} · ${t("remainingPercent", {
                        percent: formatPercent(window.remainingPercent),
                      })}`,
                      left: rect.left + rect.width / 2,
                      top: rect.top - 6,
                    });
                  },
                  () => {
                    setHovered(null);
                    setTip(null);
                  },
                )
              : face.kind === "money"
                ? moneyLead(face.parts)
                : createElement(
                    "span",
                    { "data-dsh-usages-status": "" },
                    mark(),
                    createElement("span", { "data-dsh-usages-value": "" }, face.value),
                  ),
        );

  return createElement(
    "span",
    {
      ref: rootRef,
      "data-dsh-usages-float": "",
      "data-face": face?.kind ?? "pending",
      "data-edge": dock.edge,
      "data-dragging": point === null ? "false" : "true",
      "data-window-drag-exclude": "",
      style: {
        ...placement,
        "--dsh-usages-anchor": anchorName,
      },
    },
    trigger,
    tip === null
      ? null
      : createElement(
          "span",
          {
            ref: tipRef,
            "data-dsh-usages-tip": "",
            role: "tooltip",
            style: { left: tip.left, top: tip.top },
          },
          tip.text,
        ),
  );
}
