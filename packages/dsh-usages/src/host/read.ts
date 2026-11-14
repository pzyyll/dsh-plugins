// ABOUTME: Read the DeepSeek wallet and the OpenCode Go quota into one snapshot.
// ABOUTME: Expected HTTP and account failures stay inside the snapshot; cancellation still rejects.

import {
  CHANNEL_CACHE_MS,
  parseOpencodeUsage,
  type DeepseekReading,
  type OpencodeReading,
  type UsageChannel,
  type UsageSnapshot,
  type Wallet,
} from "../shared/model.js";

export const CACHE_MS = CHANNEL_CACHE_MS;
export const MAX_BODY_BYTES = 65_536;

export interface AccountClient {
  readonly version: string;
  readonly locale: string;
  readonly timezoneOffsetSeconds: number;
}

export interface DeepseekAccountApi {
  getState(): Promise<{
    readonly status: "signed-out" | "credential-stored";
    readonly links?: { readonly usageUrl?: string; readonly topUpUrl?: string };
  }>;
  getBalance(client: AccountClient): Promise<
    | {
        readonly status: "ready";
        readonly value: readonly Wallet[];
        readonly bonusWallets: readonly Wallet[];
      }
    | { readonly status: "failed" }
    | null
  >;
}

export interface UsageDeps {
  readonly usageUrl: string;
  readonly timeoutMs: number;
  readonly cacheMs: number;
  now(): number;
  resolveKey(): Promise<string | undefined>;
  fetch(url: string, init: RequestInit): Promise<Response>;
  readAccount(client: AccountClient): Promise<DeepseekReading>;
}

type ReadyOpencode = Extract<OpencodeReading, { status: "ready" }>;

interface Cached<T> {
  readonly at: number;
  readonly reading: T;
}

export class UsageReader {
  private deepseekCache: Cached<DeepseekReading> | undefined;
  private opencodeCache: (Cached<OpencodeReading> & { readonly url: string }) | undefined;

  constructor(private readonly deps: UsageDeps) {}

  /**
   * Read only the requested channels. A channel queried inside the cache window is reused
   * unless `refresh` is set; a channel left out of the list is not queried at all.
   */
  async snapshot(
    refresh: boolean,
    channels: readonly UsageChannel[],
    client: AccountClient,
    signal: AbortSignal,
  ): Promise<UsageSnapshot> {
    const [deepseek, opencodeGo] = await Promise.all([
      channels.includes("deepseek")
        ? this.readDeepseek(refresh, client)
        : Promise.resolve(this.deepseekCache?.reading ?? { status: "unavailable" as const }),
      channels.includes("opencode-go")
        ? this.readOpencode(refresh, signal)
        : Promise.resolve(this.cachedOpencode() ?? { status: "missing-key" as const }),
    ]);
    return { deepseek, opencodeGo };
  }

  private fresh<T>(cached: Cached<T> | undefined, refresh: boolean): T | undefined {
    if (refresh || cached === undefined) return undefined;
    if (this.deps.now() - cached.at >= this.deps.cacheMs) return undefined;
    return cached.reading;
  }

  private cachedOpencode(): OpencodeReading | undefined {
    const cached = this.opencodeCache;
    if (cached === undefined || cached.url !== this.deps.usageUrl) return undefined;
    return cached.reading;
  }

  private async readDeepseek(refresh: boolean, client: AccountClient): Promise<DeepseekReading> {
    const cached = this.fresh(this.deepseekCache, refresh);
    if (cached !== undefined) return cached;
    const reading = await this.deps.readAccount(client);
    this.deepseekCache = { at: this.deps.now(), reading };
    return reading;
  }

  private async readOpencode(refresh: boolean, signal: AbortSignal): Promise<OpencodeReading> {
    const cached = this.opencodeCache;
    if (
      this.fresh(cached, refresh) !== undefined &&
      cached !== undefined &&
      cached.url === this.deps.usageUrl
    ) {
      return cached.reading;
    }
    const reading = await this.fetchOpencode(signal);
    this.opencodeCache = { url: this.deps.usageUrl, at: this.deps.now(), reading };
    return reading;
  }

  private async fetchOpencode(signal: AbortSignal): Promise<OpencodeReading> {
    const key = await this.deps.resolveKey();
    if (key === undefined) return { status: "missing-key" };
    let response: Response;
    try {
      response = await this.deps.fetch(this.deps.usageUrl, {
        method: "GET",
        redirect: "error",
        headers: { Accept: "application/json", Authorization: `Bearer ${key}` },
        signal: AbortSignal.any([signal, AbortSignal.timeout(this.deps.timeoutMs)]),
      });
    } catch (error) {
      if (signal.aborted) throw error;
      return { status: "failed" };
    }
    if (response.status === 401) return { status: "unauthorized" };
    if (response.status === 403) return { status: "forbidden" };
    if (!response.ok) return { status: "failed" };
    const text = await response.text();
    if (text.length > MAX_BODY_BYTES) return { status: "failed" };
    let body: unknown;
    try {
      body = JSON.parse(text) as unknown;
    } catch {
      return { status: "failed" };
    }
    const windows = parseOpencodeUsage(body);
    if (windows === undefined) return { status: "failed" };
    const reading: ReadyOpencode = { status: "ready", windows, fetchedAt: this.deps.now() };
    return reading;
  }
}

function linkOf(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}

/** Map the account service onto the sidebar snapshot. A thrown query is a failed reading. */
export async function readDeepseek(
  account: DeepseekAccountApi | undefined,
  client: AccountClient,
): Promise<DeepseekReading> {
  if (account === undefined) return { status: "unavailable" };
  try {
    const state = await account.getState();
    if (state.status !== "credential-stored") return { status: "signed-out" };
    const balance = await account.getBalance(client);
    if (balance === null) return { status: "signed-out" };
    if (balance.status !== "ready") return { status: "failed" };
    const usageUrl = linkOf(state.links?.usageUrl);
    const topUpUrl = linkOf(state.links?.topUpUrl);
    return {
      status: "ready",
      wallets: balance.value.map((wallet) => ({
        currency: wallet.currency,
        balance: wallet.balance,
      })),
      bonusWallets: balance.bonusWallets.map((wallet) => ({
        currency: wallet.currency,
        balance: wallet.balance,
      })),
      ...(usageUrl === undefined ? {} : { usageUrl }),
      ...(topUpUrl === undefined ? {} : { topUpUrl }),
    };
  } catch {
    return { status: "failed" };
  }
}

export function accountClient(
  version: string,
  locale: string,
  timezoneOffsetSeconds: number,
): AccountClient {
  return {
    version:
      typeof version === "string" && version.trim() !== "" ? version.trim().slice(0, 64) : "0.0.0",
    locale: typeof locale === "string" && locale.trim() !== "" ? locale.trim().slice(0, 35) : "en",
    timezoneOffsetSeconds: Number.isFinite(timezoneOffsetSeconds)
      ? Math.trunc(timezoneOffsetSeconds)
      : 0,
  };
}
