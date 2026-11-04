// ABOUTME: Parses the SuperGrok credits payload from cli-chat-proxy billing.
// ABOUTME: The plugin page renders this view; it does not draw a terminal usage bar.

import {
  BILLING_URL,
  CLIENT_IDENTIFIER,
  CLIENT_MODE_VALUE,
  GROK_CLIENT_VERSION,
  TOKEN_AUTH_VALUE,
  USAGE_FETCH_TIMEOUT_MS,
} from "./constants.ts";

const USAGE_WARN_PERCENT = 70;
const USAGE_ERROR_PERCENT = 90;
const PERCENT_MIN = 0;
const PERCENT_MAX = 100;
const CENTS_PER_DOLLAR = 100;
const MS_PER_SECOND = 1_000;
const SECONDS_PER_DAY = 86_400;
const SECONDS_PER_HOUR = 3_600;
const SECONDS_PER_MINUTE = 60;

export type UsageTone = "success" | "warning" | "error";

export interface GrokProductUsage {
  readonly label: string;
  readonly product: string | undefined;
  readonly usagePct: number;
}

export interface GrokPlanUsage {
  readonly subscriptionTier: string | undefined;
  readonly usagePct: number;
  readonly effectiveUsagePct: number;
  readonly periodType: string | undefined;
  readonly periodEndIso: string | undefined;
  readonly periodEndDisplay: string | undefined;
  readonly payAsYouGo: boolean;
  readonly onDemandEnabled: boolean | undefined;
  readonly onDemandCapCents: number | undefined;
  readonly onDemandUsedCents: number | undefined;
  readonly prepaidBalanceCents: number | undefined;
  readonly isUnifiedBillingUser: boolean | undefined;
  readonly productUsage: readonly GrokProductUsage[];
  readonly windows: readonly { usedPercent: number; label: string; resetsIn: string | undefined }[];
  readonly usable: boolean;
}

export type UsagePeriodKind = "week" | "month" | "day";

export interface GrokUsageMeter {
  readonly percent: number;
  readonly tone: UsageTone;
  /** Already formatted for a Chinese page. The client prefers {@link GrokUsageMeter.resetsCompact}. */
  readonly resetsIn?: string;
  /** Locale-neutral remaining time: `4d 12h`, `<1m`, or `due`. */
  readonly resetsCompact?: string;
}

export interface GrokUsageProductView {
  readonly label: string;
  readonly percent: number;
  readonly tone: UsageTone;
}

/** Fields the Plugins page can render without parsing the billing payload again. */
export interface GrokUsageView {
  readonly tier?: string;
  readonly credits?: GrokUsageMeter;
  readonly period?: string;
  /** Locale-neutral billing window. Absent when the payload names no week, month, or day. */
  readonly periodKind?: UsagePeriodKind;
  /** Period end as the billing payload sent it, for the client to format. */
  readonly periodEnd?: string;
  readonly prepaid?: string;
  readonly onDemand?: string;
  readonly onDemandDisabled: boolean;
  readonly effective?: GrokUsageMeter;
  readonly unified: boolean;
  readonly products: readonly GrokUsageProductView[];
}

export function usageTone(percent: number): UsageTone {
  if (percent >= USAGE_ERROR_PERCENT) return "error";
  if (percent >= USAGE_WARN_PERCENT) return "warning";
  return "success";
}

export function parseGrokPlanUsage(raw: unknown, now: number): GrokPlanUsage {
  const root = isPlainObject(raw) ? raw : undefined;
  const config = pickObject(root, "config") ?? root;
  const subscriptionTier = firstString(
    root?.["subscriptionTier"] ?? root?.["subscription_tier"] ?? config?.["subscriptionTier"],
  );
  const onDemandEnabled =
    typeof root?.["onDemandEnabled"] === "boolean" ? root["onDemandEnabled"] : undefined;

  const creditPctRaw = config?.["creditUsagePercent"] ?? config?.["credit_usage_percent"];
  const monthlyLimit = centVal(config?.["monthlyLimit"] ?? config?.["monthly_limit"]);
  const used = centVal(config?.["used"]);
  const hasCreditPct = isFiniteNumber(creditPctRaw);
  const usagePct = hasCreditPct
    ? clampPercent(creditPctRaw)
    : monthlyLimit !== undefined && monthlyLimit > 0 && used !== undefined
      ? clampPercent((used / monthlyLimit) * PERCENT_MAX)
      : 0;

  const currentPeriod = pickObject(config, "currentPeriod") ?? pickObject(config, "current_period");
  const periodTypeRaw = firstString(
    currentPeriod?.["type"] ?? currentPeriod?.["period_type"] ?? currentPeriod?.["periodType"],
  );
  const periodEndIso =
    firstString(currentPeriod?.["end"]) ??
    firstString(config?.["billingPeriodEnd"] ?? config?.["billing_period_end"]);
  const resetsIn = periodEndIso === undefined ? undefined : remainingFromIso(periodEndIso, now);
  const periodEndDisplay = periodEndIso === undefined ? undefined : formatPeriodEnd(periodEndIso);

  const onDemandCap = centVal(config?.["onDemandCap"] ?? config?.["on_demand_cap"]);
  const onDemandUsed = centVal(config?.["onDemandUsed"] ?? config?.["on_demand_used"]);
  const prepaidBalance = centVal(config?.["prepaidBalance"] ?? config?.["prepaid_balance"]);
  const payAsYouGo = (onDemandCap ?? 0) > 0;
  const onDemandUsedCents =
    onDemandUsed ??
    (used !== undefined && monthlyLimit !== undefined
      ? Math.max(0, used - monthlyLimit)
      : undefined);

  let effectiveUsagePct = usagePct;
  if (payAsYouGo && onDemandCap !== undefined && onDemandCap > 0) {
    if (usagePct >= PERCENT_MAX && onDemandUsedCents !== undefined) {
      effectiveUsagePct = clampPercent((onDemandUsedCents / onDemandCap) * PERCENT_MAX);
    } else if (!hasCreditPct && monthlyLimit !== undefined && used !== undefined) {
      const totalBudget = monthlyLimit + onDemandCap;
      effectiveUsagePct = totalBudget > 0 ? clampPercent((used / totalBudget) * PERCENT_MAX) : 0;
    }
  }

  const isUnifiedBillingUser =
    typeof config?.["isUnifiedBillingUser"] === "boolean"
      ? config["isUnifiedBillingUser"]
      : typeof config?.["is_unified_billing_user"] === "boolean"
        ? config["is_unified_billing_user"]
        : undefined;
  const productUsage = parseProductUsage(config?.["productUsage"] ?? config?.["product_usage"]);
  const windows =
    hasCreditPct ||
    (monthlyLimit !== undefined && used !== undefined) ||
    prepaidBalance !== undefined
      ? [{ usedPercent: usagePct, label: periodLabel(periodTypeRaw), resetsIn }]
      : [];
  const usable =
    windows.length > 0 ||
    subscriptionTier !== undefined ||
    prepaidBalance !== undefined ||
    payAsYouGo ||
    onDemandEnabled !== undefined ||
    productUsage.length > 0;

  return {
    subscriptionTier,
    usagePct,
    effectiveUsagePct,
    periodType: periodTypeRaw,
    periodEndIso,
    periodEndDisplay,
    payAsYouGo,
    onDemandEnabled,
    onDemandCapCents: onDemandCap,
    onDemandUsedCents,
    prepaidBalanceCents: prepaidBalance,
    isUnifiedBillingUser,
    productUsage,
    windows,
    usable,
  };
}

/** Map a parsed plan into the labels and meters the Plugins page shows. */
export function grokUsageView(usage: GrokPlanUsage): GrokUsageView | undefined {
  if (!usage.usable) return undefined;
  const window = usage.windows[0];
  const periodBits: string[] = [];
  if (usage.periodType !== undefined) periodBits.push(formatPeriodType(usage.periodType));
  if (usage.periodEndDisplay !== undefined) periodBits.push(`${usage.periodEndDisplay} 结束`);
  const onDemand =
    usage.payAsYouGo || usage.onDemandEnabled === true
      ? formatOnDemand(usage.onDemandUsedCents ?? 0, usage.onDemandCapCents)
      : undefined;
  const periodKind = periodKindOf(usage.periodType);
  return {
    ...(usage.subscriptionTier === undefined ? {} : { tier: formatTier(usage.subscriptionTier) }),
    ...(window === undefined
      ? {}
      : {
          credits: {
            percent: window.usedPercent,
            tone: usageTone(window.usedPercent),
            ...(window.resetsIn === undefined
              ? {}
              : {
                  resetsIn: formatRemainingZh(window.resetsIn),
                  resetsCompact: window.resetsIn,
                }),
          },
        }),
    ...(periodBits.length === 0 ? {} : { period: periodBits.join(" · ") }),
    ...(periodKind === undefined ? {} : { periodKind }),
    ...(usage.periodEndIso === undefined ? {} : { periodEnd: usage.periodEndIso }),
    ...(usage.prepaidBalanceCents === undefined
      ? {}
      : { prepaid: formatCentsUsd(usage.prepaidBalanceCents) }),
    ...(onDemand === undefined ? {} : { onDemand }),
    onDemandDisabled: usage.onDemandEnabled === false,
    ...(usage.payAsYouGo && usage.usagePct >= PERCENT_MAX
      ? {
          effective: { percent: usage.effectiveUsagePct, tone: usageTone(usage.effectiveUsagePct) },
        }
      : {}),
    unified: usage.isUnifiedBillingUser === true,
    products: usage.productUsage.map((product) => ({
      label: product.label,
      percent: product.usagePct,
      tone: usageTone(product.usagePct),
    })),
  };
}

export async function fetchGrokUsage(
  credentials: { access: string; userId?: string },
  signal?: AbortSignal,
  now = Date.now(),
): Promise<GrokUsageView | undefined> {
  const timeout = AbortSignal.timeout(USAGE_FETCH_TIMEOUT_MS);
  const response = await globalThis.fetch(BILLING_URL, {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${credentials.access}`,
      "X-XAI-Token-Auth": TOKEN_AUTH_VALUE,
      "x-grok-client-version": GROK_CLIENT_VERSION,
      "x-grok-client-identifier": CLIENT_IDENTIFIER,
      "x-grok-client-mode": CLIENT_MODE_VALUE,
      ...(credentials.userId === undefined ? {} : { "x-userid": credentials.userId }),
    },
    signal: signal === undefined ? timeout : AbortSignal.any([signal, timeout]),
  });
  if (!response.ok) throw new Error(`xAI usage request failed (${response.status})`);
  return grokUsageView(parseGrokPlanUsage(await response.json(), now));
}

function formatOnDemand(usedCents: number, capCents: number | undefined): string {
  const used = formatCentsUsd(usedCents);
  return capCents === undefined ? used : `${used} / ${formatCentsUsd(capCents)}`;
}

function formatRemainingZh(compact: string): string {
  if (compact === "due") return "已到重置时间";
  if (compact === "<1m") return "不足 1 分钟";
  return compact
    .replace(/(\d+)d/g, "$1 天")
    .replace(/(\d+)h/g, "$1 小时")
    .replace(/(\d+)m/g, "$1 分钟");
}

function centVal(value: unknown): number | undefined {
  if (isFiniteNumber(value)) return Math.trunc(value);
  if (!isPlainObject(value)) return undefined;
  const raw = value["val"] ?? value["value"];
  return isFiniteNumber(raw) ? Math.trunc(raw) : undefined;
}

function firstString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function remainingFromIso(iso: string, now: number): string | undefined {
  const end = Date.parse(iso);
  if (!Number.isFinite(end)) return undefined;
  return formatRemaining(end - now);
}

function formatRemaining(ms: number): string | undefined {
  if (!Number.isFinite(ms)) return undefined;
  if (ms <= 0) return "due";
  const totalSeconds = Math.floor(ms / MS_PER_SECOND);
  const days = Math.floor(totalSeconds / SECONDS_PER_DAY);
  const hours = Math.floor((totalSeconds % SECONDS_PER_DAY) / SECONDS_PER_HOUR);
  const minutes = Math.floor((totalSeconds % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE);
  if (days > 0) return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  if (hours > 0) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  if (minutes > 0) return `${minutes}m`;
  return "<1m";
}

function formatPeriodEnd(iso: string): string | undefined {
  const end = Date.parse(iso);
  if (!Number.isFinite(end)) return undefined;
  try {
    return new Intl.DateTimeFormat("zh-CN", {
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(end));
  } catch {
    return iso;
  }
}

function periodKindOf(periodType: string | undefined): UsagePeriodKind | undefined {
  if (periodType === undefined) return undefined;
  const upper = periodType.toUpperCase();
  if (upper.includes("WEEK")) return "week";
  if (upper.includes("MONTH")) return "month";
  if (upper.includes("DAY")) return "day";
  return undefined;
}

function periodLabel(periodType: string | undefined): string {
  if (periodType === undefined) return "Credits";
  const normalized = periodType.toUpperCase();
  if (normalized.includes("WEEK")) return "W";
  if (normalized.includes("MONTH")) return "M";
  if (normalized.includes("DAY")) return "D";
  return "Credits";
}

function formatPeriodType(periodType: string): string {
  const normalized = periodType.replace(/^USAGE_PERIOD_TYPE_/i, "");
  const upper = normalized.toUpperCase();
  if (upper.includes("WEEK")) return "每周";
  if (upper.includes("MONTH")) return "每月";
  if (upper.includes("DAY")) return "每天";
  return formatSnakeCase(normalized.toLowerCase());
}

function formatTier(tier: string): string {
  if (/\s/.test(tier)) return tier;
  return tier
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function formatCentsUsd(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(cents / CENTS_PER_DOLLAR);
}

function formatSnakeCase(value: string): string {
  return value
    .split(/[_\s]+/)
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function parseProductUsage(raw: unknown): GrokProductUsage[] {
  if (!Array.isArray(raw)) return [];
  const items: GrokProductUsage[] = [];
  for (const entry of raw) {
    if (!isPlainObject(entry)) continue;
    const pctRaw = entry["usagePercent"] ?? entry["usage_percent"];
    if (!isFiniteNumber(pctRaw)) continue;
    const product = firstString(entry["product"] ?? entry["product_type"] ?? entry["name"]);
    const label =
      firstString(entry["label"] ?? entry["displayName"] ?? entry["display_name"]) ??
      formatProductLabel(product);
    if (label === undefined) continue;
    items.push({ label, product, usagePct: clampPercent(pctRaw) });
  }
  items.sort((a, b) => b.usagePct - a.usagePct || a.label.localeCompare(b.label));
  return items;
}

function formatProductLabel(product: string | undefined): string | undefined {
  if (product === undefined) return undefined;
  const known: Record<string, string> = {
    PRODUCT_API: "API",
    PRODUCT_XAI_API: "API",
    PRODUCT_GROK_API: "API",
    PRODUCT_GROK_BUILD: "Build",
    PRODUCT_BUILD: "Build",
    PRODUCT_CHAT: "Chat",
    PRODUCT_GROK_CHAT: "Chat",
    PRODUCT_IMAGINE: "Imagine",
    PRODUCT_GROK_IMAGINE: "Imagine",
    PRODUCT_VOICE: "Voice",
    PRODUCT_GROK_VOICE: "Voice",
  };
  const upper = product.trim().toUpperCase();
  const named = known[upper];
  if (named !== undefined) return named;
  const stripped = upper
    .replace(/^PRODUCT_/, "")
    .replace(/^GROK_/, "")
    .replace(/_/g, " ")
    .trim();
  if (stripped.length === 0) return undefined;
  return stripped
    .split(/\s+/)
    .map((part) => (part === "API" ? "API" : part.charAt(0) + part.slice(1).toLowerCase()))
    .join(" ");
}

function clampPercent(value: number): number {
  return Math.max(PERCENT_MIN, Math.min(PERCENT_MAX, value));
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function pickObject(value: unknown, key: string): Record<string, unknown> | undefined {
  if (!isPlainObject(value)) return undefined;
  const inner = value[key];
  return isPlainObject(inner) ? inner : undefined;
}
