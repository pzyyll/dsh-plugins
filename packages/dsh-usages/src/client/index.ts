// ABOUTME: Show DeepSeek balance and OpenCode Go quota above the sidebar account.
// ABOUTME: Clicking the row opens a detail panel; the OpenCode key is never requested here.

import {
  createElement,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactElement,
  type ReactNode,
} from "react";
import {
  buttonFact,
  channelForProvider,
  compactMark,
  configuredChannels,
  dictionaries,
  fill,
  formatAgo,
  formatAmount,
  formatPercent,
  sidebarMoney,
  isRecord,
  opencodeChips,
  sourceChips,
  placePopover,
  providerOfMainSession,
  CHANNEL_CACHE_MS,
  mergeSnapshot,
  resetCountdown,
  snapshotFromRpc,
  translateWith,
  type SessionUsageSource,
  type Translate,
  type UsageChannel,
  type UsageKey,
  type MoneyPart,
  type UsageSnapshot,
  type UsageSourceReading,
  type OpencodeWindowId,
  type Wallet,
  type WindowChip,
} from "../shared/model.js";
import {
  setUsageError,
  setUsageOpen,
  setUsagePending,
  setUsageSnapshot,
  subscribeUsage,
  usageState,
} from "./store.js";
import { USAGE_CSS, USAGE_STYLE_ID } from "./styles.js";

const NS = "dsh-usages";
const ENDPOINT = "dshUsages/snapshot";
const POLL_MS = CHANNEL_CACHE_MS;

interface LocaleService {
  getLocale(): unknown;
  getSnapshot(): unknown;
  subscribe(listener: () => void): () => void;
  register(ns: string, locale: string, dict: Record<string, string>): () => void;
  bind(ns: string): (key: string) => string;
}

interface SessionListLike {
  readonly byId: Readonly<Record<string, SessionUsageSource>>;
}

type UseSessions = <Selected>(
  selector: (value: SessionListLike) => Selected,
  equal?: (left: Selected, right: Selected) => boolean,
) => Selected;

function emptySessions<Selected>(selector: (value: SessionListLike) => Selected): Selected {
  return selector({ byId: {} });
}

interface ClientContext {
  locale?: LocaleService;
  connection?: {
    rpc: {
      call(
        channel: string,
        endpoint: string,
        body: { args: Record<string, unknown> },
      ): Promise<unknown>;
    };
  };
  slots: {
    inject(name: string, effect: () => (() => void) | void): () => void;
    register(
      options: { name: string; id: string; order?: number },
      component: (props: { wide?: boolean; useSessions?: UseSessions }) => ReactElement | null,
    ): () => void;
  };
  effect(effect: () => void | (() => void)): () => void;
}

let clientContext: ClientContext | undefined;
let requestSeq = 0;

function localeId(snapshot: unknown): string {
  if (typeof snapshot === "string" && snapshot !== "") return snapshot;
  if (isRecord(snapshot)) {
    if (typeof snapshot.id === "string" && snapshot.id !== "") return snapshot.id;
    if (typeof snapshot.locale === "string" && snapshot.locale !== "") return snapshot.locale;
  }
  return "en";
}

function clientVersion(): string {
  const boot = (globalThis as { __DSH_BOOT__?: unknown }).__DSH_BOOT__;
  if (isRecord(boot)) {
    const release = boot.release;
    if (isRecord(release) && typeof release.version === "string" && release.version.trim() !== "") {
      return release.version.trim().slice(0, 64);
    }
    for (const key of ["version", "clientVersion", "dshVersion"]) {
      const value = boot[key];
      if (typeof value === "string" && value.trim() !== "") return value.trim().slice(0, 64);
    }
  }
  return "0.2.2";
}

function useTranslate(ctx: ClientContext): { readonly locale: string; readonly t: Translate } {
  const locale = useSyncExternalStore(
    (listener) => ctx.locale?.subscribe(listener) ?? (() => {}),
    () => localeId(ctx.locale?.getSnapshot() ?? ctx.locale?.getLocale() ?? "en"),
  );
  const fallback = translateWith(locale);
  const bound = ctx.locale?.bind(NS);
  const t: Translate = (key, vars) => {
    const fromService = bound?.(key);
    const template = fromService !== undefined && fromService !== key ? fromService : fallback(key);
    return fill(template, vars);
  };
  return { locale, t };
}

function useUsage() {
  return useSyncExternalStore(subscribeUsage, usageState);
}

async function loadUsage(
  refresh: boolean,
  channels: readonly UsageChannel[],
  quiet = false,
): Promise<void> {
  const ctx = clientContext;
  const locale = localeId(ctx?.locale?.getSnapshot() ?? ctx?.locale?.getLocale());
  const failed = translateWith(locale)("requestFailed");
  if (ctx?.connection === undefined) {
    setUsageError(failed);
    return;
  }
  const seq = ++requestSeq;
  if (!quiet && (refresh || usageState().snapshot === null)) setUsagePending(true);
  try {
    const result = await ctx.connection.rpc.call("/api", ENDPOINT, {
      args: {
        version: clientVersion(),
        locale,
        timezoneOffsetSeconds: -new Date().getTimezoneOffset() * 60,
        refresh,
        channels,
      },
    });
    if (seq !== requestSeq) return;
    const parsed = snapshotFromRpc(result);
    if (parsed.snapshot !== undefined) {
      setUsageSnapshot(mergeSnapshot(usageState().snapshot, parsed.snapshot, channels));
    } else setUsageError(failed);
  } catch {
    if (seq !== requestSeq) return;
    setUsageError(failed);
  }
}

function requestUsage(refresh: boolean, channels: readonly UsageChannel[], quiet = false): void {
  void loadUsage(refresh, channels, quiet);
}

function closeUsage(restoreFocus = false): void {
  setUsageOpen(false, null);
  if (!restoreFocus) return;
  globalThis.document?.querySelector<HTMLButtonElement>("[data-dsh-usages-trigger]")?.focus();
}

function frameTopInset(): number {
  const root = globalThis.document?.documentElement;
  if (root === undefined) return 8;
  const raw = getComputedStyle(root).getPropertyValue("--dsh-windows-titlebar-height");
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? parsed + 8 : 8;
}

function measureTrigger(): {
  left: number;
  top: number;
  right: number;
  bottom: number;
} | null {
  const rect = globalThis.document
    ?.querySelector("[data-dsh-usages-trigger]")
    ?.getBoundingClientRect();
  if (rect === undefined || rect.width === 0 || rect.height === 0) return null;
  return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
}

function installStyle(): () => void {
  const root = globalThis.document;
  if (root?.head === undefined || root.head === null) return () => {};
  const existing = root.getElementById(USAGE_STYLE_ID);
  const style = existing ?? root.createElement("style");
  style.id = USAGE_STYLE_ID;
  style.textContent = USAGE_CSS;
  if (existing === null) root.head.appendChild(style);
  return () => {
    style.remove();
  };
}

/**
 * Gauge mark on the host's own icon grid: a 16px box with stroke-width 1 at that size,
 * which is what `regular` sidebar icons use. The drawing sits inside x 7.3–28.7 /
 * y 13.8–25.1, so the viewBox is cropped to that ink instead of a padded square.
 */
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

function refreshIcon(): ReactElement {
  return createElement(
    "svg",
    {
      viewBox: "0 0 24 24",
      width: 16,
      height: 16,
      "aria-hidden": true,
    },
    createElement("path", {
      d: "M21 12a9 9 0 0 1-15.5 6.2L3 16M3 21v-5h5M3 12a9 9 0 0 1 15.5-6.2L21 8M21 3v5h-5",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": "1.8",
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
    }),
  );
}

function channelName(snapshot: UsageSnapshot | null, channel: UsageChannel, t: Translate): string {
  if (channel === "opencode-go") return t("opencodeGo");
  if (channel === "deepseek") return t("deepseek");
  const source = snapshot?.sources?.find((item) => item.id === channel);
  if (source?.reading.status === "ready") return source.reading.title;
  return source?.id ?? channel;
}

/** Built-in channels plus every registered source, so a refresh can reach all of them. */
function trackedChannels(snapshot: UsageSnapshot | null): readonly string[] {
  const channels = ["deepseek", "opencode-go"];
  for (const source of snapshot?.sources ?? []) {
    if (!channels.includes(source.id)) channels.push(source.id);
  }
  return channels;
}

function fact(name: string, value: string): ReactElement {
  return createElement(
    "span",
    { "data-dsh-usages-fact": "" },
    createElement("span", { "data-dsh-usages-name": "" }, name),
    createElement("span", { "data-dsh-usages-value": "" }, value),
  );
}

/** DeepSeek balance as a capsule: the currency mark is smaller than the figure. */
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

/** Channel name alone; the leading mark carries the numbers. */
function nameFact(name: string, lead: "ring" | "pill"): ReactElement {
  return createElement(
    "span",
    { "data-dsh-usages-fact": "", [`data-${lead}`]: "true" },
    createElement("span", { "data-dsh-usages-name": "" }, name),
  );
}

/** Ring geometry in the 36-unit viewBox. Angles run clockwise from twelve o'clock. */
const RING_CENTER = 18;
const RING_RADIUS = 13.6;
const RING_STROKE = 2.6;
/* Round caps add strokeWidth / 2 past each end (about 5.5° here), so the drawn gap is
   narrower than this number; it still reads as separate arcs at the sidebar's icon size. */
const RING_GAP = 22;

/**
 * Upper half is the 5-hour window; the lower half splits into a week quarter on the
 * left and a month quarter on the right. Twelve o'clock is 0, so the top arc runs
 * from 270 through 0 to 90.
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

function arcPath(from: number, to: number): string {
  const start = ringPoint(from);
  const end = ringPoint(to);
  const sweep = to - from > 180 ? 1 : 0;
  return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${RING_RADIUS} ${RING_RADIUS} 0 ${sweep} 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
}

/**
 * One window is a closed ring: the track is the used side, and the remainder is the
 * other side. Several windows stay separate arcs.
 */
function closedRing(
  window: WindowChip,
  size: number,
  ref: { readonly current: SVGSVGElement | null },
  hovered: string | null,
  onHover: (window: WindowChip) => void,
  onLeave: () => void,
): ReactElement {
  const remaining = Math.min(100, Math.max(0, window.remainingPercent));
  const circle = {
    cx: RING_CENTER,
    cy: RING_CENTER,
    r: RING_RADIUS,
    "stroke-width": RING_STROKE,
  };
  const full = remaining <= 0 || remaining >= 100;
  return createElement(
    "svg",
    {
      ref,
      "data-dsh-usages-ring": "",
      "data-closed": "true",
      "data-hovering": hovered === null ? "false" : "true",
      viewBox: "0 0 36 36",
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
      {
        "data-dsh-usages-segment": "",
        "data-hover": hovered === window.id ? "true" : "false",
      },
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

/**
 * One arc per window; each arc fills clockwise from empty to that window's remainder.
 * The visible arcs sit in a group that scales on hover, while the hit stroke stays put
 * so a grown segment cannot push the pointer out of its own target.
 */
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
      viewBox: "0 0 36 36",
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
      const from = span.from + RING_GAP / 2;
      const to = span.to - RING_GAP / 2;
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

function UsageRow(props: {
  readonly wide: boolean | undefined;
  readonly ctx: ClientContext;
  readonly useSessions: UseSessions | undefined;
}): ReactElement {
  const wide = props.wide !== false;
  const usage = useUsage();
  const { locale, t } = useTranslate(props.ctx);
  const useSessions = props.useSessions ?? emptySessions;
  const provider = useSessions(providerOfMainSession, (left, right) => left === right);
  const channel = channelForProvider(provider, usage.snapshot?.sources ?? []);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const shown = usage.snapshot === null ? null : buttonFact(usage.snapshot, channel, locale, t);
  const chips =
    usage.snapshot === null
      ? null
      : channel === "opencode-go"
        ? opencodeChips(usage.snapshot.opencodeGo, t)
        : titledSourceChips(
            usage.snapshot.sources?.find((source) => source.id === channel)?.reading ?? {
              status: "unavailable",
            },
            t,
          );
  const money =
    usage.snapshot === null || channel !== "deepseek"
      ? []
      : sidebarMoney(usage.snapshot.deepseek, locale);
  const loading = usage.pending && usage.snapshot === null;
  const label =
    shown === null ? (loading ? t("loading") : t("details")) : `${shown.name} ${shown.value}`;
  const ringRef = useRef<SVGSVGElement | null>(null);
  const tipRef = useRef<HTMLSpanElement | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [tip, setTip] = useState<{
    readonly text: string;
    readonly left: number;
    readonly top: number;
  } | null>(null);
  const ring =
    chips === null
      ? null
      : windowRing(
          chips,
          28,
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
        );

  /*
   * A fixed box is only viewport-anchored until an ancestor declares containment; the
   * sidebar sets container-type, so `left`/`top` land in that ancestor's space. Measure
   * where the tooltip actually rendered and shift it onto the ring, clamped to the frame.
   */
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

  useEffect(() => {
    const loadVisible = (refresh: boolean, quiet: boolean) => {
      if (globalThis.document?.hidden) return;
      requestUsage(refresh, [channel], quiet);
    };
    loadVisible(false, false);
    const timer = setInterval(() => loadVisible(true, true), POLL_MS);
    const onVisible = () => {
      if (!globalThis.document?.hidden) requestUsage(false, [channel]);
    };
    globalThis.document?.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      globalThis.document?.removeEventListener("visibilitychange", onVisible);
    };
  }, [channel]);

  return createElement(
    "div",
    {
      "data-dsh-usages-root": "",
      "data-wide": wide ? "true" : "false",
      "data-window-drag-exclude": "",
    },
    createElement(
      "button",
      {
        ref: buttonRef,
        type: "button",
        "data-dsh-usages-trigger": "",
        "aria-haspopup": "dialog",
        "aria-expanded": usage.open,
        "aria-label": label,
        "aria-busy": usage.pending,
        onClick: () => {
          setHovered(null);
          setTip(null);
          const button = buttonRef.current;
          if (usage.open) {
            closeUsage();
            return;
          }
          const rect = button?.getBoundingClientRect();
          setUsageOpen(
            true,
            rect === undefined
              ? null
              : {
                  left: rect.left,
                  top: rect.top,
                  right: rect.right,
                  bottom: rect.bottom,
                },
          );
          requestUsage(false, trackedChannels(usageState().snapshot));
        },
      },
      wide ? (ring ?? (money.length > 0 ? moneyLead(money) : mark())) : null,
      wide
        ? shown === null
          ? loading
            ? fact(channelName(usage.snapshot, channel, t), t("loading"))
            : null
          : ring === null
            ? money.length > 0
              ? nameFact(shown.name, "pill")
              : fact(shown.name, shown.value)
            : nameFact(shown.name, "ring")
        : createElement(
            "span",
            { "data-dsh-usages-compact": "" },
            loading ? "…" : compactMark(usage.snapshot, channel, locale),
          ),
    ),
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

function safeUrl(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

function clockIcon(): ReactElement {
  return createElement(
    "svg",
    {
      viewBox: "0 0 24 24",
      width: 12,
      height: 12,
      "aria-hidden": true,
    },
    createElement("circle", {
      cx: "12",
      cy: "12",
      r: "8",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": "1.8",
    }),
    createElement("path", {
      d: "M12 8v4l2.5 1.5",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": "1.8",
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
    }),
  );
}

function balanceText(wallets: readonly Wallet[], locale: string): string {
  if (wallets.length === 0) return "—";
  return wallets.map((wallet) => formatAmount(wallet.balance, wallet.currency, locale)).join(" · ");
}

function balanceCell(label: string, wallets: readonly Wallet[], locale: string): ReactElement {
  return createElement(
    "div",
    { "data-dsh-usages-balance": "" },
    createElement("span", { "data-dsh-usages-label": "" }, label),
    createElement("span", { "data-dsh-usages-figure": "" }, balanceText(wallets, locale)),
  );
}

const WINDOW_TITLES = new Set(["rolling", "weekly", "monthly", "week", "month", "day", "credits"]);

function windowTitle(id: string, fallback: string, t: Translate): string {
  if (!WINDOW_TITLES.has(id)) return fallback;
  return t(`window.${id}` as UsageKey);
}

function titledSourceChips(
  reading: UsageSourceReading,
  t: Translate,
): ReturnType<typeof sourceChips> {
  const chips = sourceChips(reading);
  if (chips === null) return null;
  return chips.map((chip) => {
    const name = windowTitle(chip.id, chip.name, t);
    return { ...chip, tag: name, name };
  });
}

function windowBlock(
  window: {
    readonly id: string;
    readonly label: string;
    readonly usedPercent: number;
    readonly remainingPercent: number;
    readonly resetsAt?: string;
  },
  t: Translate,
  now: number,
): ReactElement {
  const empty = window.remainingPercent <= 0;
  const low = window.remainingPercent < 20;
  const reset = window.resetsAt === undefined ? "" : resetCountdown(window.resetsAt, now, t);
  return createElement(
    "div",
    { "data-dsh-usages-window": "", key: window.id },
    createElement(
      "div",
      { "data-dsh-usages-row": "" },
      createElement("span", { "data-dsh-usages-quota": "" }, window.label),
      createElement(
        "span",
        { "data-dsh-usages-remain": "" },
        createElement("span", null, t("remainingLabel")),
        createElement(
          "span",
          { "data-dsh-usages-figure": "" },
          formatPercent(window.remainingPercent),
        ),
      ),
    ),
    createElement(
      "span",
      { "data-dsh-usages-track": "", "aria-hidden": true },
      createElement("span", {
        "data-dsh-usages-fill": "",
        "data-low": low && !empty ? "true" : "false",
        "data-empty": empty ? "true" : "false",
        style: { width: `${window.remainingPercent}%` },
      }),
    ),
    createElement(
      "div",
      { "data-dsh-usages-meta": "" },
      createElement("span", null, t("usedPercent", { percent: formatPercent(window.usedPercent) })),
      reset === ""
        ? null
        : createElement(
            "span",
            { "data-dsh-usages-reset": "" },
            clockIcon(),
            createElement("span", null, reset),
          ),
    ),
  );
}

function deepseekSection(snapshot: UsageSnapshot, t: Translate, locale: string): ReactNode {
  const reading = snapshot.deepseek;
  if (reading.status !== "ready") {
    const text =
      reading.status === "signed-out"
        ? t("signedOut")
        : reading.status === "unavailable"
          ? t("deepseekUnavailable")
          : t("balanceFailed");
    return createElement("p", { "data-dsh-usages-note": "" }, text);
  }
  if (reading.wallets.length === 0 && reading.bonusWallets.length === 0) {
    return createElement("p", { "data-dsh-usages-note": "" }, t("noBalance"));
  }
  return createElement(
    "div",
    { "data-dsh-usages-balances": "" },
    balanceCell(t("recharge"), reading.wallets, locale),
    balanceCell(t("bonus"), reading.bonusWallets, locale),
  );
}

function actionLink(href: string, label: string, primary = false): ReactElement {
  return createElement(
    "a",
    {
      "data-dsh-usages-action": "",
      ...(primary ? { "data-primary": "true" } : {}),
      href,
      target: "_blank",
      rel: "noreferrer",
    },
    label,
  );
}

/** DeepSeek links sit on the section title row. Absent when the account has no pages. */
function deepseekActions(snapshot: UsageSnapshot, t: Translate): ReactNode {
  const reading = snapshot.deepseek;
  if (reading.status !== "ready") return null;
  const usageUrl = safeUrl(reading.usageUrl);
  const topUpUrl = safeUrl(reading.topUpUrl);
  if (usageUrl === undefined && topUpUrl === undefined) return null;
  return createElement(
    "div",
    { "data-dsh-usages-actions": "" },
    usageUrl === undefined ? null : actionLink(usageUrl, t("usageLink")),
    topUpUrl === undefined ? null : actionLink(topUpUrl, t("topUp"), true),
  );
}

function opencodeSection(snapshot: UsageSnapshot, t: Translate, now: number): ReactNode {
  const reading = snapshot.opencodeGo;
  if (reading.status !== "ready") {
    const text =
      reading.status === "missing-key"
        ? t("missingKey")
        : reading.status === "unauthorized"
          ? t("unauthorized")
          : reading.status === "forbidden"
            ? t("noPlan")
            : t("quotaFailed");
    return createElement("p", { "data-dsh-usages-note": "" }, text);
  }
  return createElement(
    "div",
    { "data-dsh-usages-windows": "" },
    reading.windows.map((window) =>
      windowBlock({ ...window, label: t(`window.${window.id}` as UsageKey) }, t, now),
    ),
    createElement(
      "p",
      { "data-dsh-usages-updated": "" },
      createElement("span", { "data-dsh-usages-dot": "", "aria-hidden": true }),
      t("lastQuery", { time: formatAgo(reading.fetchedAt, now, t) }),
    ),
  );
}

function sourceSection(
  snapshot: UsageSnapshot,
  channel: string,
  t: Translate,
  now: number,
): ReactNode {
  const source = snapshot.sources?.find((item) => item.id === channel);
  if (source === undefined || source.reading.status !== "ready") {
    return createElement("p", { "data-dsh-usages-note": "" }, t("quotaFailed"));
  }
  return createElement(
    "div",
    { "data-dsh-usages-windows": "" },
    source.reading.windows.map((window) =>
      windowBlock({ ...window, label: windowTitle(window.id, window.label, t) }, t, now),
    ),
  );
}

function UsagePanel(props: { readonly ctx: ClientContext }): ReactElement | null {
  const usage = useUsage();
  const { locale, t } = useTranslate(props.ctx);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<{ readonly left: number; readonly top: number } | null>(
    null,
  );
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!usage.open) return;
    setNow(Date.now());
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 30_000);
    return () => {
      clearInterval(timer);
    };
  }, [usage.open]);

  useLayoutEffect(() => {
    if (!usage.open) {
      setPosition(null);
      return;
    }
    const panel = panelRef.current;
    const anchor = usage.anchor;
    if (panel === null || anchor === null) return;
    const next = placePopover(
      anchor,
      { width: panel.offsetWidth, height: panel.offsetHeight },
      { width: window.innerWidth, height: window.innerHeight },
      frameTopInset(),
    );
    setPosition((current) =>
      current?.left === next.left && current.top === next.top ? current : next,
    );
  }, [usage.open, usage.anchor, usage.snapshot, usage.pending, usage.error]);

  useEffect(() => {
    if (!usage.open) return;
    const panel = panelRef.current;
    panel?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      closeUsage(true);
    };
    const onPointer = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (panel?.contains(target)) return;
      if (target instanceof Element && target.closest("[data-dsh-usages-trigger]") !== null) return;
      closeUsage(false);
    };
    const follow = () => {
      const anchor = measureTrigger();
      if (anchor === null) {
        closeUsage(false);
        return;
      }
      setUsageOpen(true, anchor);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPointer);
    window.addEventListener("resize", follow);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("resize", follow);
    };
  }, [usage.open]);

  if (!usage.open) return null;
  const snapshot = usage.snapshot;
  const above =
    usage.anchor === null ? undefined : Math.max(120, usage.anchor.top - frameTopInset() - 8);
  return createElement(
    "div",
    {
      ref: panelRef,
      "data-dsh-usages-panel": "",
      "data-window-drag-exclude": "",
      role: "dialog",
      "aria-label": t("details"),
      tabIndex: -1,
      style:
        position === null
          ? { visibility: "hidden", maxHeight: above }
          : { left: position.left, top: position.top, visibility: "visible", maxHeight: above },
    },
    createElement(
      "div",
      { "data-dsh-usages-head": "" },
      createElement("span", { "data-dsh-usages-markbar": "", "aria-hidden": true }),
      createElement("h2", null, t("details")),
    ),
    snapshot === null
      ? createElement("p", { "data-dsh-usages-note": "" }, t("loading"))
      : configuredChannels(snapshot).map((channel) =>
          createElement(
            "section",
            { "data-dsh-usages-section": "", key: channel },
            createElement(
              "div",
              { "data-dsh-usages-section-head": "" },
              createElement("h3", null, channelName(snapshot, channel, t)),
              channel === "deepseek" ? deepseekActions(snapshot, t) : null,
            ),
            channel === "deepseek"
              ? deepseekSection(snapshot, t, locale)
              : channel === "opencode-go"
                ? opencodeSection(snapshot, t, now)
                : sourceSection(snapshot, channel, t, now),
          ),
        ),
    usage.error === null
      ? null
      : createElement("p", { "data-dsh-usages-error": "", role: "alert" }, usage.error),
    createElement(
      "footer",
      { "data-dsh-usages-foot": "" },
      createElement(
        "button",
        {
          type: "button",
          "data-dsh-usages-action": "",
          "data-dsh-usages-refresh": "",
          "aria-busy": usage.pending,
          disabled: usage.pending,
          onClick: () => {
            requestUsage(true, trackedChannels(usage.snapshot));
          },
        },
        refreshIcon(),
        usage.pending ? t("refreshing") : t("refresh"),
      ),
    ),
  );
}

export const inject = ["slots", "connection", "locale"];

/** Register the sidebar row above Settings and the detail panel on the frame overlay. */
export function apply(ctx: ClientContext): void {
  clientContext = ctx;
  ctx.effect(() => installStyle());
  ctx.effect(() => {
    const locale = ctx.locale;
    if (locale === undefined) return;
    const disposeEn = locale.register(NS, "en", { ...dictionaries.en });
    const disposeZh = locale.register(NS, "zh", { ...dictionaries.zh });
    return () => {
      disposeZh();
      disposeEn();
    };
  });
  ctx.slots.inject("sidebar.footer.action", () =>
    ctx.slots.register(
      {
        name: "sidebar.footer.action",
        id: "dsh-usages",
        order: -10,
      },
      (props) =>
        createElement(UsageRow, {
          wide: props.wide,
          useSessions: props.useSessions,
          ctx,
        }),
    ),
  );
  ctx.slots.inject("shell.overlay", () =>
    ctx.slots.register(
      {
        name: "shell.overlay",
        id: "dsh-usages-detail",
        order: 20,
      },
      () => createElement(UsagePanel, { ctx }),
    ),
  );
}
