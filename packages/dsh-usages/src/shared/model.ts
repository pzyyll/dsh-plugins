// ABOUTME: Shared usage snapshot, OpenCode parsing, and sidebar wording.
// ABOUTME: The host fills the snapshot and the sidebar only renders this shape.

import enJson from "../../locale/en.json" with { type: "json" };
import zhJson from "../../locale/zh.json" with { type: "json" };

export const OPENCODE_WINDOWS = ["rolling", "weekly", "monthly"] as const;

export type OpencodeWindowId = (typeof OPENCODE_WINDOWS)[number];

export interface OpencodeWindow {
  readonly id: OpencodeWindowId;
  readonly status: string;
  readonly usedPercent: number;
  readonly remainingPercent: number;
  readonly resetsAt?: string;
}

export interface Wallet {
  readonly currency: string;
  readonly balance: string;
}

export type DeepseekReading =
  | { readonly status: "unavailable" }
  | { readonly status: "signed-out" }
  | { readonly status: "failed" }
  | {
      readonly status: "ready";
      readonly wallets: readonly Wallet[];
      readonly bonusWallets: readonly Wallet[];
      readonly usageUrl?: string;
      readonly topUpUrl?: string;
    };

export type OpencodeReading =
  | { readonly status: "missing-key" }
  | { readonly status: "unauthorized" }
  | { readonly status: "forbidden" }
  | { readonly status: "failed" }
  | {
      readonly status: "ready";
      readonly windows: readonly OpencodeWindow[];
      readonly fetchedAt: number;
    };

export interface UsageSnapshot {
  readonly deepseek: DeepseekReading;
  readonly opencodeGo: OpencodeReading;
}

export interface Anchor {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

export interface PopupPlacement {
  readonly left: number;
  readonly top: number;
}

export type UsageKey = Exclude<keyof typeof enJson, "meta">;

function uiStrings(dict: typeof enJson | typeof zhJson): Record<UsageKey, string> {
  const out = {} as Record<UsageKey, string>;
  for (const key of Object.keys(dict) as (keyof typeof dict)[]) {
    const value = dict[key];
    if (key !== "meta" && typeof value === "string") out[key] = value;
  }
  return out;
}

const en = uiStrings(enJson);
const zh = uiStrings(zhJson);

export const dictionaries = { en, zh };

export function fill(template: string, vars?: Readonly<Record<string, string | number>>): string {
  if (vars === undefined) return template;
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = vars[key];
    return value === undefined ? match : String(value);
  });
}

export function dictionaryFor(locale: string): typeof en {
  return locale.toLowerCase().startsWith("zh") ? zh : en;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function percentOf(value: unknown): number | undefined {
  const number =
    typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  if (!Number.isFinite(number)) return undefined;
  return Math.min(100, Math.max(0, number));
}

function roundPercent(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Parse the OpenCode Go usage document. Percent fields are used, not remaining. */
export function parseOpencodeUsage(body: unknown): readonly OpencodeWindow[] | undefined {
  if (!isRecord(body) || !isRecord(body.usage)) return undefined;
  const windows: OpencodeWindow[] = [];
  for (const id of OPENCODE_WINDOWS) {
    const raw = body.usage[id];
    if (!isRecord(raw)) continue;
    const used = percentOf(raw.percent);
    if (used === undefined) continue;
    const status = typeof raw.status === "string" && raw.status !== "" ? raw.status : "ok";
    const resetsAt =
      typeof raw.resetsAt === "string" && raw.resetsAt !== "" ? raw.resetsAt : undefined;
    windows.push({
      id,
      status,
      usedPercent: roundPercent(used),
      remainingPercent: roundPercent(100 - used),
      ...(resetsAt === undefined ? {} : { resetsAt }),
    });
  }
  return windows.length === 0 ? undefined : windows;
}

export function formatPercent(value: number): string {
  const rounded = roundPercent(value);
  return Number.isInteger(rounded) ? `${rounded}%` : `${rounded.toFixed(1)}%`;
}

export function formatAmount(balance: string, currency: string, locale: string): string {
  return renderAmount(balance, currency, locale)?.text ?? balance;
}

/** en-US prints CNY as "CN¥"; the mark we show is just "¥". */
function stripCnyPrefix(text: string): string {
  return text.replace(/CN(?=[¥￥])/g, "");
}

/** Currency mark and figure split so the sidebar pill can size them apart. */
export interface MoneyPart {
  readonly symbol: string;
  readonly amount: string;
}

function moneyLocale(locale: string): string {
  return locale.toLowerCase().startsWith("zh") ? "zh-CN" : "en-US";
}

/** One wallet as a symbol plus its figure. Non-money currencies keep a single run of text. */
export function formatMoneyPart(balance: string, currency: string, locale: string): MoneyPart {
  const rendered = renderAmount(balance, currency, locale);
  if (rendered === undefined || (currency !== "CNY" && currency !== "USD")) {
    return { symbol: "", amount: rendered?.text ?? balance };
  }
  return { symbol: rendered.symbol, amount: rendered.figure };
}

interface TruncatedAmount {
  readonly negative: boolean;
  readonly whole: string;
  readonly frac: string;
}

interface RenderedAmount {
  readonly symbol: string;
  readonly figure: string;
  readonly text: string;
}

/**
 * Keep the first two decimal digits and drop the rest. Number formatting would round
 * `12.569` up to `12.57`; the balance should show `12.56`.
 */
function truncateDecimal(balance: string): TruncatedAmount | undefined {
  const match = /^([+-]?)(\d+)(?:\.(\d*))?$/.exec(balance.trim());
  if (match === null) return undefined;
  const whole = (match[2] ?? "0").replace(/^0+(?=\d)/, "");
  const frac = (match[3] ?? "").slice(0, 2).padEnd(2, "0");
  const negative = match[1] === "-" && !(whole === "0" && frac === "00");
  return { negative, whole, frac };
}

function renderAmount(
  balance: string,
  currency: string,
  locale: string,
): RenderedAmount | undefined {
  const truncated = truncateDecimal(balance);
  if (truncated === undefined) return undefined;
  const localeTag = moneyLocale(locale);
  const grouped = new Intl.NumberFormat(localeTag, { maximumFractionDigits: 0 }).format(
    Number(truncated.whole),
  );
  const money = currency === "CNY" || currency === "USD";
  if (!money) {
    const figure = `${truncated.negative ? "-" : ""}${grouped}.${truncated.frac}`;
    return { symbol: "", figure, text: currency === "" ? figure : `${figure} ${currency}` };
  }
  const parts = new Intl.NumberFormat(localeTag, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).formatToParts(truncated.negative ? -1 : 1);
  let symbol = "";
  const figure: string[] = [];
  const text: string[] = [];
  for (const part of parts) {
    const value =
      part.type === "integer"
        ? grouped
        : part.type === "fraction"
          ? truncated.frac
          : part.type === "currency" && currency === "CNY"
            ? stripCnyPrefix(part.value)
            : part.value;
    if (part.type === "currency") symbol += value;
    else figure.push(value);
    text.push(value);
  }
  return { symbol, figure: figure.join("").trim(), text: text.join("") };
}

/** Wallets the sidebar pill shows: the recharge balance, or the bonus when that is all there is. */
export function sidebarMoney(reading: DeepseekReading, locale: string): readonly MoneyPart[] {
  if (reading.status !== "ready") return [];
  const wallets = reading.wallets.length > 0 ? reading.wallets : reading.bonusWallets;
  return wallets.map((wallet) => formatMoneyPart(wallet.balance, wallet.currency, locale));
}

export function formatInstant(iso: string, locale: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(locale.toLowerCase().startsWith("zh") ? "zh-CN" : "en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export type Translate = (key: UsageKey, vars?: Readonly<Record<string, string | number>>) => string;

export function translateWith(locale: string): Translate {
  const dict = dictionaryFor(locale);
  return (key, vars) => fill(dict[key], vars);
}

/** Whole seconds until a reset instant; undefined when the instant will not parse. */
export function secondsUntil(iso: string, now: number): number | undefined {
  const at = new Date(iso).getTime();
  if (Number.isNaN(at)) return undefined;
  return Math.max(0, Math.round((at - now) / 1000));
}

/** Spoken-length countdown: "2 小时 15 分" in Chinese, "2h 15m" in English. */
export function formatCountdown(seconds: number, t: Translate): string {
  const total = Math.max(0, Math.floor(seconds));
  const days = Math.floor(total / 86_400);
  const hours = Math.floor((total % 86_400) / 3_600);
  const minutes = Math.floor((total % 3_600) / 60);
  if (days > 0) {
    const day = t("countdownDay", { value: days });
    return hours > 0 ? `${day} ${t("countdownHour", { value: hours })}` : day;
  }
  if (hours > 0) {
    const hour = t("countdownHour", { value: hours });
    return minutes > 0 ? `${hour} ${t("countdownMinute", { value: minutes })}` : hour;
  }
  if (minutes > 0) return t("countdownMinute", { value: minutes });
  return total > 0 ? t("countdownSecond", { value: total }) : t("resetSoon");
}

/** One window's reset line as a countdown rather than a clock time. */
export function resetCountdown(iso: string, now: number, t: Translate): string {
  const seconds = secondsUntil(iso, now);
  if (seconds === undefined) return t("resetUnknown");
  if (seconds <= 0) return t("resetSoon");
  return t("reset", { time: formatCountdown(seconds, t) });
}

/** How long ago a query happened: "2 分钟前" or "2m ago". Future or invalid times read as just now. */
export function formatAgo(at: number, now: number, t: Translate): string {
  if (!Number.isFinite(at) || !Number.isFinite(now)) return t("agoJust");
  const elapsed = Math.max(0, Math.floor((now - at) / 1000));
  const days = Math.floor(elapsed / 86_400);
  const hours = Math.floor(elapsed / 3_600);
  const minutes = Math.floor(elapsed / 60);
  if (days > 0) return t("agoDay", { value: days });
  if (hours > 0) return t("agoHour", { value: hours });
  if (minutes > 0) return t("agoMinute", { value: minutes });
  return t("agoJust");
}

function walletText(wallets: readonly Wallet[], locale: string): string | undefined {
  if (wallets.length === 0) return undefined;
  return wallets.map((wallet) => formatAmount(wallet.balance, wallet.currency, locale)).join(" · ");
}

/** Sidebar headline follows the open session's provider. Anything else stays on DeepSeek. */
export type UsageChannel = "deepseek" | "opencode-go";

/** Fields the sidebar reads from the open session list. Other projection data is ignored. */
export interface SessionUsageSource {
  readonly retainedBy?: { readonly mainView?: number };
  readonly projectionValues?: {
    readonly modelSelection?: {
      readonly next?: { readonly provider?: string } | null;
      readonly lastUsed?: { readonly provider?: string } | null;
    };
  };
}

/** Provider id of the session retained by the main conversation, if one is open. */
export function providerOfMainSession(list: {
  readonly byId: Readonly<Record<string, SessionUsageSource>>;
}): string | null {
  for (const session of Object.values(list.byId)) {
    if ((session.retainedBy?.mainView ?? 0) <= 0) continue;
    const selection = session.projectionValues?.modelSelection;
    const provider = selection?.next?.provider ?? selection?.lastUsed?.provider;
    return typeof provider === "string" && provider !== "" ? provider : null;
  }
  return null;
}

/** Map a provider route onto a usage channel. Unknown and DeepSeek routes use the wallet. */
export function channelForProvider(provider: string | null | undefined): UsageChannel {
  return provider === "opencode-go" ? "opencode-go" : "deepseek";
}

/** A signed-in balance read, including a failed refresh. Signed out is not configured. */
export function deepseekConfigured(reading: DeepseekReading): boolean {
  return reading.status === "ready" || reading.status === "failed";
}

/** An OpenCode key was present. A missing key is not configured and stays hidden. */
export function opencodeConfigured(reading: OpencodeReading): boolean {
  return reading.status !== "missing-key";
}

/** Channels that have something to show. Unconfigured sources are omitted. */
export function configuredChannels(snapshot: UsageSnapshot): readonly UsageChannel[] {
  const channels: UsageChannel[] = [];
  if (deepseekConfigured(snapshot.deepseek)) channels.push("deepseek");
  if (opencodeConfigured(snapshot.opencodeGo)) channels.push("opencode-go");
  return channels;
}

/** One sidebar fact for the active channel, or nothing when that channel is not configured. */
export function buttonFact(
  snapshot: UsageSnapshot,
  channel: UsageChannel,
  locale: string,
  t: Translate,
): { readonly name: string; readonly value: string } | null {
  if (channel === "opencode-go") {
    if (!opencodeConfigured(snapshot.opencodeGo)) return null;
    return { name: t("opencodeGo"), value: opencodeFact(snapshot.opencodeGo, t) };
  }
  if (!deepseekConfigured(snapshot.deepseek)) return null;
  return { name: t("deepseek"), value: deepseekFact(snapshot.deepseek, locale, t) };
}

/** Short DeepSeek and OpenCode facts for the sidebar row. */
export function sidebarFacts(
  snapshot: UsageSnapshot,
  locale: string,
  t: Translate,
): { readonly deepseek: string; readonly opencode: string; readonly label: string } {
  const deepseek = deepseekFact(snapshot.deepseek, locale, t);
  const opencode = opencodeFact(snapshot.opencodeGo, t);
  return { deepseek, opencode, label: t("rowLabel", { deepseek, opencode }) };
}

function deepseekFact(reading: DeepseekReading, locale: string, t: Translate): string {
  if (reading.status === "signed-out") return t("signedOut");
  if (reading.status === "failed") return t("balanceFailed");
  if (reading.status === "unavailable") return t("deepseekUnavailable");
  return (
    walletText(reading.wallets, locale) ??
    walletText(reading.bonusWallets, locale) ??
    t("noBalance")
  );
}

function headlineWindow(
  reading: Extract<OpencodeReading, { status: "ready" }>,
): OpencodeWindow | undefined {
  return reading.windows.find((window) => window.id === "rolling") ?? reading.windows[0];
}

/** How full a window still is, used for the chip's status dot. */
export type WindowLevel = "ok" | "low" | "empty";

export function windowLevel(remainingPercent: number): WindowLevel {
  if (remainingPercent <= 0) return "empty";
  return remainingPercent < 20 ? "low" : "ok";
}

/** One window as a sidebar chip: short tag, remainder, and dot severity. */
export interface WindowChip {
  readonly id: OpencodeWindowId;
  readonly tag: string;
  readonly remainingPercent: number;
  readonly level: WindowLevel;
}

/** Sidebar chips for every window, or null when the reading has no windows to show. */
export function opencodeChips(
  reading: OpencodeReading,
  t: Translate,
): readonly WindowChip[] | null {
  if (reading.status !== "ready") return null;
  const chips = reading.windows.map((window) => ({
    id: window.id,
    tag: t(`short.${window.id}` as UsageKey),
    remainingPercent: window.remainingPercent,
    level: windowLevel(window.remainingPercent),
  }));
  return chips.length === 0 ? null : chips;
}

/** Every window on one line: "5h 6% W 2% M 1%". Also the button's accessible name. */
function opencodeFact(reading: OpencodeReading, t: Translate): string {
  if (reading.status === "missing-key") return t("missingKey");
  if (reading.status === "unauthorized") return t("unauthorized");
  if (reading.status === "forbidden") return t("noPlan");
  if (reading.status === "failed") return t("quotaFailed");
  const parts = reading.windows.map(
    (window) => `${t(`short.${window.id}` as UsageKey)} ${formatPercent(window.remainingPercent)}`,
  );
  return parts.length === 0 ? t("quotaFailed") : parts.join(" ");
}

/**
 * Collapsed rail shows the active channel's figure.
 * DeepSeek uses the wallet amount; OpenCode Go uses the rolling remainder.
 */
export function compactMark(
  snapshot: UsageSnapshot | null,
  channel: UsageChannel = "deepseek",
  locale = "en",
): string {
  if (snapshot === null) return "–";
  if (channel === "opencode-go") {
    if (snapshot.opencodeGo.status !== "ready") return "–";
    const window = headlineWindow(snapshot.opencodeGo);
    return window === undefined ? "–" : formatPercent(window.remainingPercent);
  }
  if (snapshot.deepseek.status !== "ready") return "–";
  return (
    walletText(snapshot.deepseek.wallets, locale) ??
    walletText(snapshot.deepseek.bonusWallets, locale) ??
    "–"
  );
}

export function placePopover(
  anchor: Anchor,
  popup: { readonly width: number; readonly height: number },
  viewport: { readonly width: number; readonly height: number },
  topInset = 8,
): PopupPlacement {
  const gap = 8;
  const margin = 8;
  const topLimit = Math.max(margin, topInset);
  let left = anchor.left;
  if (left + popup.width > viewport.width - margin) {
    left = viewport.width - margin - popup.width;
  }
  const top = anchor.top - gap - popup.height;
  return { left: Math.max(margin, left), top: Math.max(topLimit, top) };
}

const DEEPSEEK_STATUSES = new Set(["unavailable", "signed-out", "failed", "ready"]);
const OPENCODE_STATUSES = new Set(["missing-key", "unauthorized", "forbidden", "failed", "ready"]);

function walletFrom(value: unknown): Wallet | undefined {
  if (!isRecord(value) || typeof value.currency !== "string" || typeof value.balance !== "string") {
    return undefined;
  }
  return { currency: value.currency, balance: value.balance };
}

function walletsFrom(value: unknown): readonly Wallet[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const wallet = walletFrom(item);
    return wallet === undefined ? [] : [wallet];
  });
}

function windowFrom(value: unknown): OpencodeWindow | undefined {
  if (!isRecord(value) || !OPENCODE_WINDOWS.includes(value.id as OpencodeWindowId))
    return undefined;
  const used = percentOf(value.usedPercent);
  const remaining = percentOf(value.remainingPercent);
  if (used === undefined || remaining === undefined || typeof value.status !== "string")
    return undefined;
  const resetsAt = typeof value.resetsAt === "string" ? value.resetsAt : undefined;
  return {
    id: value.id as OpencodeWindowId,
    status: value.status,
    usedPercent: used,
    remainingPercent: remaining,
    ...(resetsAt === undefined ? {} : { resetsAt }),
  };
}

function deepseekFrom(value: unknown): DeepseekReading | undefined {
  if (
    !isRecord(value) ||
    typeof value.status !== "string" ||
    !DEEPSEEK_STATUSES.has(value.status)
  ) {
    return undefined;
  }
  if (value.status !== "ready")
    return { status: value.status as "unavailable" | "signed-out" | "failed" };
  const usageUrl = typeof value.usageUrl === "string" ? value.usageUrl : undefined;
  const topUpUrl = typeof value.topUpUrl === "string" ? value.topUpUrl : undefined;
  return {
    status: "ready",
    wallets: walletsFrom(value.wallets),
    bonusWallets: walletsFrom(value.bonusWallets),
    ...(usageUrl === undefined ? {} : { usageUrl }),
    ...(topUpUrl === undefined ? {} : { topUpUrl }),
  };
}

function opencodeFrom(value: unknown): OpencodeReading | undefined {
  if (
    !isRecord(value) ||
    typeof value.status !== "string" ||
    !OPENCODE_STATUSES.has(value.status)
  ) {
    return undefined;
  }
  if (value.status !== "ready") {
    return { status: value.status as "missing-key" | "unauthorized" | "forbidden" | "failed" };
  }
  if (!Array.isArray(value.windows) || typeof value.fetchedAt !== "number") return undefined;
  const windows = value.windows.flatMap((item) => {
    const window = windowFrom(item);
    return window === undefined ? [] : [window];
  });
  if (windows.length === 0) return undefined;
  return { status: "ready", windows, fetchedAt: value.fetchedAt };
}

/** Keep a host or RPC payload inside the snapshot the sidebar knows how to draw. */
export function snapshotFrom(value: unknown): UsageSnapshot | undefined {
  if (!isRecord(value)) return undefined;
  const deepseek = deepseekFrom(value.deepseek);
  const opencodeGo = opencodeFrom(value.opencodeGo);
  if (deepseek === undefined || opencodeGo === undefined) return undefined;
  return { deepseek, opencodeGo };
}

export function snapshotFromRpc(value: unknown): {
  readonly snapshot?: UsageSnapshot;
  readonly error?: string;
} {
  if (!isRecord(value)) return { error: "request failed" };
  if (value.ok === false) {
    const message =
      isRecord(value.error) && typeof value.error.message === "string"
        ? value.error.message
        : "request failed";
    return { error: message };
  }
  const snapshot = snapshotFrom(value.ok === true ? value.value : value);
  return snapshot === undefined ? { error: "request failed" } : { snapshot };
}
