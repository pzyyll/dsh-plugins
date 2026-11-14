// ABOUTME: Read the DeepSeek wallet and the OpenCode Go quota into one snapshot.
// ABOUTME: Expected HTTP and account failures stay inside the snapshot; cancellation still rejects.

import {
  parseOpencodeUsage,
  type DeepseekReading,
  type OpencodeReading,
  type UsageSnapshot,
  type Wallet,
} from "../shared/model.js";

export const CACHE_MS = 15_000;
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

export class UsageReader {
  private cache:
    | { readonly url: string; readonly at: number; readonly reading: ReadyOpencode }
    | undefined;

  constructor(private readonly deps: UsageDeps) {}

  async snapshot(
    refresh: boolean,
    client: AccountClient,
    signal: AbortSignal,
  ): Promise<UsageSnapshot> {
    const [deepseek, opencodeGo] = await Promise.all([
      this.deps.readAccount(client),
      this.readOpencode(refresh, signal),
    ]);
    return { deepseek, opencodeGo };
  }

  private async readOpencode(refresh: boolean, signal: AbortSignal): Promise<OpencodeReading> {
    const cached = this.cache;
    if (
      !refresh &&
      cached !== undefined &&
      cached.url === this.deps.usageUrl &&
      this.deps.now() - cached.at < this.deps.cacheMs
    ) {
      return cached.reading;
    }
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
    this.cache = { url: this.deps.usageUrl, at: reading.fetchedAt, reading };
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
