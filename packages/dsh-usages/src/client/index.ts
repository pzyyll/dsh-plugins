// ABOUTME: Show one usage amount in a floating capsule on the content edge.
// ABOUTME: Clicking it opens the detail panel; the OpenCode key is never requested here.

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
  configuredChannels,
  defaultChannel,
  deepseekConfigured,
  dictionaries,
  fill,
  formatAgo,
  formatAmount,
  formatPercent,
  isRecord,
  mainSessionRow,
  opencodeChips,
  placePopover,
  sameMainSessionRow,
  sidebarMoney,
  sourceChips,
  CHANNEL_CACHE_MS,
  mergeSnapshot,
  resetCountdown,
  snapshotFromRpc,
  translateWith,
  type SessionUsageSource,
  type Translate,
  type UsageChannel,
  type UsageKey,
  type UsageSnapshot,
  type Wallet,
  type WindowChip,
} from "../shared/model.js";
import { UsageCapsule, type CapsuleFace } from "./capsule.js";
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
      component: (props?: unknown) => ReactElement | null,
    ): () => void;
  };
  effect(effect: () => void | (() => void)): () => void;
  get?(name: string): unknown;
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
    setUsageError(failed, channels);
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
      setUsageSnapshot(mergeSnapshot(usageState().snapshot, parsed.snapshot, channels), channels);
    } else setUsageError(failed, channels);
  } catch {
    if (seq !== requestSeq) return;
    setUsageError(failed, channels);
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

/** A small turning arc in the leading slot while a channel is still being queried. */
function spinner(): ReactElement {
  return createElement("span", { "data-dsh-usages-spinner": "", "aria-hidden": true });
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
    /* Only the channel list scrolls; the title and the refresh button stay put. */
    createElement(
      "div",
      { "data-dsh-usages-body": "" },
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
    ),
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

interface SessionListLike {
  readonly byId: Readonly<Record<string, SessionUsageSource>>;
}

type UseSessions = <Selected>(
  selector: (value: SessionListLike) => Selected,
  equal?: (left: Selected, right: Selected) => boolean,
) => Selected;

interface PanelInfo {
  readonly activePanelId: string | null;
}

type UsePanelInfo = <Selected>(selector: (info: PanelInfo) => Selected) => Selected;

interface OverlayProps {
  readonly useSessions?: UseSessions;
  readonly usePanelInfo?: UsePanelInfo;
}

interface ModelRouteStore {
  getSnapshot(): unknown;
  subscribe(listener: () => void): () => void;
}

interface ModelDirectories {
  directoryFor(sessionId: string): { readonly store: ModelRouteStore };
}

function emptySessions<Selected>(selector: (value: SessionListLike) => Selected): Selected {
  return selector({ byId: {} });
}

function overlayProps(value: unknown): OverlayProps {
  if (!isRecord(value)) return {};
  const useSessions = typeof value.useSessions === "function" ? value.useSessions : undefined;
  const usePanelInfo = typeof value.usePanelInfo === "function" ? value.usePanelInfo : undefined;
  return {
    ...(useSessions === undefined ? {} : { useSessions: useSessions as UseSessions }),
    ...(usePanelInfo === undefined ? {} : { usePanelInfo: usePanelInfo as UsePanelInfo }),
  };
}

function noopSubscribe(): () => void {
  return () => {};
}

function optionalService<T>(ctx: ClientContext, name: string): T | undefined {
  try {
    return (ctx.get?.(name) as T | undefined) ?? undefined;
  } catch {
    return undefined;
  }
}

/** Blank sessions record no model. The picker resolves that to the catalog default. */
function modelRoute(
  ctx: ClientContext,
  sessionId: string | undefined,
): ModelRouteStore | undefined {
  if (sessionId === undefined || sessionId === "") return undefined;
  const directories = optionalService<ModelDirectories>(ctx, "modelDirectories");
  if (directories === undefined || typeof directories.directoryFor !== "function") return undefined;
  try {
    return directories.directoryFor(sessionId).store;
  } catch {
    return undefined;
  }
}

function routeProvider(store: ModelRouteStore | undefined): string | undefined {
  if (store === undefined) return undefined;
  const state = store.getSnapshot();
  if (!isRecord(state) || !isRecord(state.current)) return undefined;
  const provider = state.current.provider;
  return typeof provider === "string" && provider !== "" ? provider : undefined;
}

/**
 * Off the conversation, wait until DeepSeek has answered. If it is configured, stop there.
 * Otherwise wait for the other channels before deciding there is nothing to show.
 */
function offSessionPending(
  snapshot: UsageSnapshot | null,
  answered: ReadonlySet<string>,
  channels: readonly string[],
): boolean {
  if (!answered.has("deepseek")) return true;
  if (snapshot !== null && deepseekConfigured(snapshot.deepseek)) return false;
  return channels.some((channel) => channel !== "deepseek" && !answered.has(channel));
}

function channelWindows(
  snapshot: UsageSnapshot,
  channel: UsageChannel,
  t: Translate,
): readonly WindowChip[] | null {
  if (channel === "opencode-go") return opencodeChips(snapshot.opencodeGo, t);
  if (channel === "deepseek") return null;
  const source = snapshot.sources?.find((item) => item.id === channel);
  if (source === undefined) return null;
  const chips = sourceChips(source.reading);
  if (chips === null) return null;
  return chips.map((chip) => {
    const name = windowTitle(chip.id, chip.name, t);
    return { ...chip, tag: name, name };
  });
}

/** The previous row's mark: a ring, the balance pills, or a status, and never the channel name. */
function channelFace(
  snapshot: UsageSnapshot,
  channel: UsageChannel,
  locale: string,
  t: Translate,
): CapsuleFace | null {
  const windows = channelWindows(snapshot, channel, t);
  if (windows !== null) return { kind: "ring", windows };
  if (channel === "deepseek") {
    const parts = sidebarMoney(snapshot.deepseek, locale);
    if (parts.length > 0) return { kind: "money", parts };
  }
  const fact = buttonFact(snapshot, channel, locale, t);
  if (fact === null) return null;
  return { kind: "status", value: fact.value };
}

function UsageEntry(props: {
  readonly ctx: ClientContext;
  readonly overlay: OverlayProps;
}): ReactElement | null {
  const usage = useUsage();
  const { locale, t } = useTranslate(props.ctx);
  const useSessions = props.overlay.useSessions ?? emptySessions;
  const usePanelInfo =
    props.overlay.usePanelInfo ??
    ((selector: (info: PanelInfo) => boolean) => selector({ activePanelId: null }));
  const conversation = usePanelInfo((info) => info.activePanelId === null);
  const main = useSessions(mainSessionRow, sameMainSessionRow);
  const route = modelRoute(props.ctx, conversation ? main?.id : undefined);
  const routed = useSyncExternalStore(route?.subscribe ?? noopSubscribe, () =>
    routeProvider(route),
  );
  const sessionChannel =
    conversation && main !== null
      ? channelForProvider(routed ?? main.provider, usage.snapshot?.sources ?? [])
      : null;
  const channels = sessionChannel === null ? trackedChannels(usage.snapshot) : [sessionChannel];
  const channel =
    sessionChannel ?? (usage.snapshot === null ? null : defaultChannel(usage.snapshot));
  const face =
    usage.snapshot === null || channel === null
      ? null
      : channelFace(usage.snapshot, channel, locale, t);
  const pending =
    face !== null
      ? false
      : sessionChannel === null
        ? offSessionPending(usage.snapshot, usage.answered, channels)
        : !usage.answered.has(sessionChannel);
  const fact =
    usage.snapshot === null || channel === null
      ? null
      : buttonFact(usage.snapshot, channel, locale, t);
  const label = fact === null ? t(pending ? "loading" : "details") : `${fact.name} ${fact.value}`;
  return createElement(UsageCapsule, {
    usage,
    t,
    face,
    label,
    pending,
    channels,
    requestUsage,
    closeUsage,
    setOpen: (anchor) => {
      setUsageOpen(true, anchor);
    },
    trackedChannels,
    spinner,
    pollMs: POLL_MS,
  });
}

/** Register the floating capsule and the detail panel on the frame overlay. */
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
  ctx.slots.inject("shell.overlay", () =>
    ctx.slots.register(
      {
        name: "shell.overlay",
        id: "dsh-usages",
        order: 2,
      },
      (slotProps) => createElement(UsageEntry, { ctx, overlay: overlayProps(slotProps) }),
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
