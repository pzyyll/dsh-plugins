// ABOUTME: Cover quota parsing, sidebar wording, and host snapshot behavior.
// ABOUTME: These tests never let a fixture key appear in the returned snapshot.

import { credentialRef } from "@deepseek-ai/dsh-credentials";
import { describe, expect, it } from "vitest";
import { usageConfig } from "../src/host/config.js";
import { resolveApiKey } from "../src/host/keys.js";
import {
  accountClient,
  readDeepseek,
  UsageReader,
  type DeepseekAccountApi,
} from "../src/host/read.js";
import { UsageService } from "../src/host/service.js";
import { normalizeSourceReading, UsageSourceRegistry } from "../src/host/sources.js";
import { setUsageError, setUsageSnapshot, usageState } from "../src/client/store.js";
import {
  buttonFact,
  channelForProvider,
  compactMark,
  configuredChannels,
  defaultChannel,
  dictionaries,
  formatAgo,
  formatAmount,
  formatMoneyPart,
  opencodeChips,
  parseOpencodeUsage,
  windowLevel,
  placePopover,
  mainSessionRow,
  sameMainSessionRow,
  formatCountdown,
  resetCountdown,
  mergeSnapshot,
  sidebarFacts,
  snapshotFromRpc,
  translateWith,
} from "../src/shared/model.js";

const SECRET = "sk-test-secret-value";
const t = translateWith("en");

function usageBody(percent = 11) {
  return {
    usage: {
      rolling: { status: "ok", percent, resetsAt: "2026-11-15T01:00:00Z" },
      weekly: { status: "ok", percent: 20, resetsAt: "2026-11-17T00:00:00Z" },
      monthly: { status: "ok", percent: 40, resetsAt: "2026-12-01T00:00:00Z" },
    },
  };
}

function createReader(overrides: Partial<ConstructorParameters<typeof UsageReader>[0]> = {}) {
  const calls: string[] = [];
  const deps = {
    usageUrl: "https://opencode.ai/zen/go/v1/usage",
    timeoutMs: 1000,
    cacheMs: 15_000,
    now: () => 1_000,
    resolveKey: async () => SECRET,
    fetch: async (url: string) => {
      calls.push(url);
      return Response.json(usageBody());
    },
    readAccount: async () => ({ status: "signed-out" as const }),
    sources: () => [],
    ...overrides,
  };
  return { reader: new UsageReader(deps), calls };
}

describe("OpenCode usage", () => {
  it("treats percent as used and keeps the remainder", () => {
    const windows = parseOpencodeUsage(usageBody(11));
    expect(windows?.find((window) => window.id === "rolling")).toMatchObject({
      usedPercent: 11,
      remainingPercent: 89,
      status: "ok",
    });
  });

  it("rejects a document without windows", () => {
    expect(parseOpencodeUsage({ usage: {} })).toBeUndefined();
    expect(parseOpencodeUsage(null)).toBeUndefined();
  });
});

describe("sidebar wording", () => {
  it("puts every window on the button as tag plus remainder", () => {
    const snapshot = {
      deepseek: { status: "signed-out" as const },
      opencodeGo: {
        status: "ready" as const,
        fetchedAt: 1_000,
        windows: [
          { id: "rolling" as const, status: "ok", usedPercent: 94, remainingPercent: 6 },
          { id: "weekly" as const, status: "ok", usedPercent: 98, remainingPercent: 2 },
          { id: "monthly" as const, status: "ok", usedPercent: 99, remainingPercent: 1 },
        ],
      },
    };
    expect(buttonFact(snapshot, "opencode-go", "en", translateWith("en"))?.value).toBe(
      "5h 6% W 2% M 1%",
    );
    expect(buttonFact(snapshot, "opencode-go", "en", translateWith("en"))?.value).toBe(
      "5h 6% W 2% M 1%",
    );
  });

  it("turns each window into a chip with a severity dot", () => {
    const reading = {
      status: "ready" as const,
      fetchedAt: 1_000,
      windows: [
        { id: "rolling" as const, status: "ok", usedPercent: 6, remainingPercent: 94 },
        { id: "weekly" as const, status: "ok", usedPercent: 98, remainingPercent: 2 },
        { id: "monthly" as const, status: "ok", usedPercent: 100, remainingPercent: 0 },
      ],
    };
    expect(opencodeChips(reading, translateWith("zh"))).toEqual([
      { id: "rolling", tag: "5h", name: "5 小时", remainingPercent: 94, level: "ok" },
      { id: "weekly", tag: "周", name: "每周", remainingPercent: 2, level: "low" },
      { id: "monthly", tag: "月", name: "每月", remainingPercent: 0, level: "empty" },
    ]);
    expect((opencodeChips(reading, translateWith("en")) ?? []).map((chip) => chip.tag)).toEqual([
      "5h",
      "W",
      "M",
    ]);
    expect(opencodeChips({ status: "missing-key" }, translateWith("en"))).toBeNull();
    expect(windowLevel(20)).toBe("ok");
    expect(windowLevel(19.9)).toBe("low");
  });

  it("formats yuan and the 5-hour remainder", () => {
    const yuan = formatMoneyPart("55", "CNY", "en");
    expect(yuan.symbol).toMatch(/CN|¥|￥/);
    expect(yuan.amount).toContain("55.00");
    expect(yuan.amount).not.toContain(yuan.symbol);
    expect(formatAmount("12.5", "CNY", "zh")).toContain("12.50");
    expect(formatAmount("12.5", "CNY", "zh")).not.toContain("12.500");
    expect(formatAmount("1.239", "USD", "en")).toContain("1.23");
    expect(formatAmount("1.239", "USD", "en")).not.toContain("1.24");
    const facts = sidebarFacts(
      {
        deepseek: {
          status: "ready",
          wallets: [{ currency: "CNY", balance: "12.5" }],
          bonusWallets: [],
        },
        opencodeGo: {
          status: "ready",
          fetchedAt: 1_000,
          windows: [{ id: "rolling", status: "ok", usedPercent: 11, remainingPercent: 89 }],
        },
      },
      "zh",
      translateWith("zh"),
    );
    expect(facts.deepseek).toContain("12.50");
    expect(facts.opencode).toBe("5h 89%");
    expect(facts.label).toContain("5h 89%");
  });

  it("uses a short status when a source is missing", () => {
    const facts = sidebarFacts(
      {
        deepseek: { status: "signed-out" },
        opencodeGo: { status: "missing-key" },
      },
      "en",
      t,
    );
    expect(facts.deepseek).toBe("Signed out");
    expect(facts.opencode).toBe("No API key");
    expect(
      compactMark({
        deepseek: { status: "signed-out" },
        opencodeGo: { status: "missing-key" },
      }),
    ).toBe("–");
  });

  it("keeps the same visible keys in both locales", () => {
    expect(Object.keys(dictionaries.zh).sort()).toEqual(Object.keys(dictionaries.en).sort());
  });

  it("follows the open session and hides a channel that is not configured", () => {
    const snapshot = {
      deepseek: {
        status: "ready" as const,
        wallets: [{ currency: "CNY", balance: "12.5" }],
        bonusWallets: [],
      },
      opencodeGo: {
        status: "ready" as const,
        fetchedAt: 1_000,
        windows: [{ id: "rolling" as const, status: "ok", usedPercent: 11, remainingPercent: 89 }],
      },
    };
    expect(channelForProvider(null)).toBe("deepseek");
    expect(channelForProvider("deepseek-account")).toBe("deepseek");
    expect(channelForProvider("opencode-go")).toBe("opencode-go");
    expect(
      channelForProvider("xai-supergrok", [{ id: "xai-supergrok", providers: ["xai-supergrok"] }]),
    ).toBe("xai-supergrok");
    expect(buttonFact(snapshot, "deepseek", "zh", translateWith("zh"))?.value).toContain("12.50");
    expect(buttonFact(snapshot, "opencode-go", "zh", translateWith("zh"))?.value).toBe("5h 89%");
    expect(
      buttonFact(
        { deepseek: { status: "signed-out" }, opencodeGo: { status: "missing-key" } },
        "deepseek",
        "zh",
        translateWith("zh"),
      ),
    ).toBeNull();
    expect(
      configuredChannels({
        deepseek: { status: "signed-out" },
        opencodeGo: { status: "unauthorized" },
      }),
    ).toEqual(["opencode-go"]);
    expect(
      mainSessionRow({
        byId: {
          other: {
            retainedBy: { mainView: 0 },
            projectionValues: {
              modelSelection: { next: { provider: "deepseek" }, lastUsed: null },
            },
          },
          open: {
            retainedBy: { mainView: 1 },
            projectionValues: {
              modelSelection: {
                next: { provider: "opencode-go" },
                lastUsed: { provider: "deepseek" },
              },
            },
          },
        },
      }),
    ).toEqual({ id: "open", provider: "opencode-go" });
    expect(
      mainSessionRow({
        byId: {
          blank: {
            retainedBy: { mainView: 1 },
            projectionValues: { modelSelection: { next: null, lastUsed: null } },
          },
        },
      }),
    ).toEqual({ id: "blank", provider: null });
    expect(mainSessionRow({ byId: {} })).toBeNull();
    expect(sameMainSessionRow({ id: "a", provider: null }, { id: "a", provider: null })).toBe(true);
    expect(
      sameMainSessionRow({ id: "a", provider: null }, { id: "a", provider: "opencode-go" }),
    ).toBe(false);
    expect(sameMainSessionRow(null, null)).toBe(true);
  });

  it("keeps DeepSeek off a conversation, or falls back to the first configured channel", () => {
    const both = {
      deepseek: {
        status: "ready" as const,
        wallets: [{ currency: "CNY", balance: "54.82" }],
        bonusWallets: [],
      },
      opencodeGo: {
        status: "ready" as const,
        fetchedAt: 1_000,
        windows: [{ id: "rolling" as const, status: "ok", usedPercent: 11, remainingPercent: 89 }],
      },
    };
    expect(defaultChannel(both)).toBe("deepseek");
    // A configured DeepSeek keeps the slot even when it has nothing to show.
    expect(defaultChannel({ ...both, deepseek: { status: "failed" } })).toBe("deepseek");
    expect(
      defaultChannel({
        deepseek: { status: "signed-out" },
        opencodeGo: both.opencodeGo,
      }),
    ).toBe("opencode-go");
    expect(
      defaultChannel({
        deepseek: { status: "signed-out" },
        opencodeGo: { status: "missing-key" },
        sources: [
          {
            id: "xai-supergrok",
            providers: ["xai-supergrok"],
            reading: {
              status: "ready",
              title: "SuperGrok",
              windows: [{ id: "week", label: "Weekly", usedPercent: 90, remainingPercent: 10 }],
            },
          },
        ],
      }),
    ).toBe("xai-supergrok");
    expect(
      defaultChannel({ deepseek: { status: "signed-out" }, opencodeGo: { status: "missing-key" } }),
    ).toBeNull();
  });
});

describe("reset countdown", () => {
  const now = Date.parse("2026-11-15T00:00:00Z");

  it("counts down instead of printing a clock time", () => {
    expect(resetCountdown("2026-11-15T02:15:00Z", now, translateWith("zh"))).toBe(
      "2 小时 15 分后重置",
    );
    expect(resetCountdown("2026-11-15T02:15:00Z", now, translateWith("en"))).toBe(
      "Resets in 2h 15m",
    );
    expect(resetCountdown("2026-11-17T00:00:00Z", now, translateWith("zh"))).toBe("2 天后重置");
  });

  it("handles elapsed and unreadable resets", () => {
    expect(resetCountdown("2026-11-14T23:00:00Z", now, translateWith("zh"))).toBe("即将重置");
    expect(resetCountdown("not-a-date", now, translateWith("en"))).toBe("Reset time unknown");
    expect(formatCountdown(90, translateWith("en"))).toBe("1m");
    expect(formatCountdown(30, translateWith("zh"))).toBe("30 秒");
  });

  it("says how long ago OpenCode Go was queried", () => {
    const queried = Date.parse("2026-11-14T22:00:00Z");
    expect(formatAgo(queried, queried + 30_000, translateWith("zh"))).toBe("刚刚");
    expect(formatAgo(queried, queried + 5 * 60_000, translateWith("zh"))).toBe("5 分钟前");
    expect(formatAgo(queried, queried + 3 * 3_600_000, translateWith("en"))).toBe("3h ago");
    expect(formatAgo(queried, queried + 2 * 86_400_000, translateWith("zh"))).toBe("2 天前");
  });
});

describe("money marks", () => {
  it("drops the CN letters in front of the yuan sign", () => {
    const yuan = formatMoneyPart("55", "CNY", "en");
    expect(yuan.symbol).toBe("¥");
    expect(yuan.amount).toContain("55.00");
    expect(yuan.amount).not.toMatch(/CN/);
    expect(formatAmount("55", "CNY", "en")).not.toMatch(/CN/);
    expect(formatAmount("12.5", "CNY", "zh")).toContain("12.50");
    expect(formatAmount("12.569", "CNY", "zh")).toContain("12.56");
    expect(formatAmount("12.569", "CNY", "zh")).not.toContain("12.57");
    expect(formatMoneyPart("12.999", "CNY", "en").amount).toContain("12.99");
  });
});

describe("detail refresh guard", () => {
  it("keeps a channel the request did not ask for", () => {
    const previous = {
      deepseek: {
        status: "ready" as const,
        wallets: [{ currency: "CNY", balance: "12.50" }],
        bonusWallets: [],
      },
      opencodeGo: { status: "missing-key" as const },
      sources: [
        {
          id: "xai-supergrok",
          providers: ["xai-supergrok"],
          reading: {
            status: "ready" as const,
            title: "SuperGrok",
            windows: [{ id: "week", label: "week", usedPercent: 4, remainingPercent: 96 }],
          },
        },
      ],
    };
    const next = {
      deepseek: { status: "unavailable" as const },
      opencodeGo: {
        status: "ready" as const,
        fetchedAt: 1,
        windows: [{ id: "rolling" as const, status: "ok", usedPercent: 1, remainingPercent: 99 }],
      },
      sources: [
        {
          id: "xai-supergrok",
          providers: ["xai-supergrok"],
          reading: { status: "unavailable" as const },
        },
      ],
    };
    expect(mergeSnapshot(previous, next, ["opencode-go"]).deepseek).toEqual(previous.deepseek);
    expect(mergeSnapshot(previous, next, ["opencode-go"]).opencodeGo).toEqual(next.opencodeGo);
    expect(mergeSnapshot(previous, next, ["opencode-go"]).sources?.[0]?.reading).toEqual(
      previous.sources?.[0]?.reading,
    );
    expect(mergeSnapshot(null, next, ["deepseek"])).toEqual(next);
  });
});

describe("loading a channel", () => {
  it("counts only the requested channels as answered", () => {
    const snapshot = {
      deepseek: { status: "signed-out" as const },
      opencodeGo: { status: "missing-key" as const },
    };
    expect(usageState().answered.has("deepseek")).toBe(false);
    setUsageSnapshot(snapshot, ["deepseek"]);
    expect(usageState().answered.has("deepseek")).toBe(true);
    expect(usageState().answered.has("opencode-go")).toBe(false);

    /* A response that leaves a channel alone must not clear its loading state. */
    const answered = usageState().answered;
    setUsageSnapshot(snapshot, ["deepseek"]);
    expect(usageState().answered).toBe(answered);

    setUsageError("request failed", ["opencode-go"]);
    expect(usageState().answered.has("opencode-go")).toBe(true);
    expect(usageState().error).toBe("request failed");
    expect(usageState().pending).toBe(false);
  });
});

describe("detail placement", () => {
  it("opens above the trigger and stays inside the viewport", () => {
    const placed = placePopover(
      { left: 40, top: 500, right: 280, bottom: 540 },
      { width: 320, height: 200 },
      { width: 360, height: 700 },
    );
    expect(placed.top).toBe(292);
    expect(placed.left).toBeLessThanOrEqual(40);
    expect(placed.left + 320).toBeLessThanOrEqual(360 - 8);
  });
});

describe("snapshot transport", () => {
  it("accepts a direct result and drops fields it does not render", () => {
    const parsed = snapshotFromRpc({
      ok: true,
      value: {
        deepseek: {
          status: "ready",
          wallets: [{ currency: "USD", balance: "1", extra: SECRET }],
          bonusWallets: [],
        },
        opencodeGo: { status: "missing-key", token: SECRET },
      },
    });
    expect(parsed.snapshot?.opencodeGo).toEqual({ status: "missing-key" });
    expect(JSON.stringify(parsed)).not.toContain(SECRET);
  });
});

describe("DeepSeek account", () => {
  const client = accountClient("", "zh-CN", -480);

  it("fills a blank client version", () => {
    expect(client.version).toBe("0.0.0");
    expect(client.locale).toBe("zh-CN");
  });

  it("returns signed out without calling balance", async () => {
    let balanceCalls = 0;
    const account: DeepseekAccountApi = {
      getState: async () => ({ status: "signed-out" }),
      getBalance: async () => {
        balanceCalls += 1;
        return null;
      },
    };
    expect(await readDeepseek(account, client)).toEqual({ status: "signed-out" });
    expect(balanceCalls).toBe(0);
  });

  it("copies wallets and links", async () => {
    const account: DeepseekAccountApi = {
      getState: async () => ({
        status: "credential-stored",
        links: {
          usageUrl: "https://platform.deepseek.com/usage",
          topUpUrl: "https://platform.deepseek.com/top_up",
        },
      }),
      getBalance: async () => ({
        status: "ready",
        value: [{ currency: "CNY", balance: "3" }],
        bonusWallets: [{ currency: "CNY", balance: "1" }],
      }),
    };
    expect(await readDeepseek(account, client)).toEqual({
      status: "ready",
      wallets: [{ currency: "CNY", balance: "3" }],
      bonusWallets: [{ currency: "CNY", balance: "1" }],
      usageUrl: "https://platform.deepseek.com/usage",
      topUpUrl: "https://platform.deepseek.com/top_up",
    });
  });

  it("turns a thrown account query into a failed reading", async () => {
    const account: DeepseekAccountApi = {
      getState: async () => {
        throw new Error(SECRET);
      },
      getBalance: async () => null,
    };
    const reading = await readDeepseek(account, client);
    expect(reading).toEqual({ status: "failed" });
    expect(JSON.stringify(reading)).not.toContain(SECRET);
    expect(await readDeepseek(undefined, client)).toEqual({ status: "unavailable" });
  });
});

describe("usage reader", () => {
  const client = accountClient("0.2.2", "zh", 28_800);

  it("caches a successful quota until refresh", async () => {
    let now = 5_000;
    const { reader, calls } = createReader({ now: () => now });
    const both = ["deepseek", "opencode-go"] as const;
    const first = await reader.snapshot(false, both, client, new AbortController().signal);
    now = 6_000;
    const second = await reader.snapshot(false, both, client, new AbortController().signal);
    const third = await reader.snapshot(true, both, client, new AbortController().signal);
    expect(calls).toHaveLength(2);
    expect(first.opencodeGo).toMatchObject({ status: "ready" });
    expect(second).toEqual(first);
    expect(third.opencodeGo).toMatchObject({ status: "ready", fetchedAt: 6_000 });
  });

  it("queries each channel on its own 15 second cache", async () => {
    let now = 1_000;
    let accountReads = 0;
    const { reader, calls } = createReader({
      now: () => now,
      readAccount: async () => {
        accountReads += 1;
        return {
          status: "ready",
          wallets: [{ currency: "CNY", balance: "9" }],
          bonusWallets: [],
        };
      },
    });
    const signal = new AbortController().signal;
    await reader.snapshot(false, ["deepseek"], client, signal);
    expect(accountReads).toBe(1);
    expect(calls).toHaveLength(0);

    now = 5_000;
    await reader.snapshot(false, ["deepseek", "opencode-go"], client, signal);
    expect(accountReads).toBe(1);
    expect(calls).toHaveLength(1);

    now = 10_000;
    await reader.snapshot(false, ["opencode-go"], client, signal);
    expect(accountReads).toBe(1);
    expect(calls).toHaveLength(1);

    now = 21_000;
    await reader.snapshot(false, ["deepseek"], client, signal);
    expect(accountReads).toBe(2);
    expect(calls).toHaveLength(1);
  });

  it("keeps a contributed source on its own 15 second cache", async () => {
    let now = 1_000;
    let reads = 0;
    const source = {
      id: "xai-supergrok",
      providers: ["xai-supergrok"],
      read: async (refresh: boolean) => {
        reads += 1;
        return {
          status: "ready" as const,
          title: "SuperGrok",
          windows: [
            { id: "week", label: "week", usedPercent: refresh ? 2 : 1, remainingPercent: 98 },
          ],
          token: SECRET,
        };
      },
    };
    const { reader, calls } = createReader({
      now: () => now,
      sources: () => [source],
    });
    const signal = new AbortController().signal;
    const first = await reader.snapshot(false, ["xai-supergrok"], client, signal);
    expect(reads).toBe(1);
    expect(calls).toHaveLength(0);
    expect(first.deepseek).toEqual({ status: "unavailable" });
    expect(JSON.stringify(first.sources)).not.toContain(SECRET);
    expect(first.sources?.[0]?.reading).toMatchObject({ status: "ready", title: "SuperGrok" });

    now = 5_000;
    await reader.snapshot(false, ["deepseek"], client, signal);
    expect(reads).toBe(1);

    now = 20_000;
    const again = await reader.snapshot(true, ["xai-supergrok"], client, signal);
    expect(reads).toBe(2);
    expect(again.sources?.[0]?.reading).toMatchObject({ status: "ready" });
  });

  it("does not put the key in an unauthorized or thrown result", async () => {
    const unauthorized = createReader({
      fetch: async (_url, init) => {
        expect(JSON.stringify(init)).toContain(SECRET);
        return new Response("no", { status: 401 });
      },
    });
    const denied = await unauthorized.reader.snapshot(
      true,
      ["opencode-go"],
      client,
      new AbortController().signal,
    );
    expect(denied.opencodeGo).toEqual({ status: "unauthorized" });
    expect(JSON.stringify(denied)).not.toContain(SECRET);

    const thrown = createReader({
      fetch: async () => {
        throw new Error(`Bearer ${SECRET}`);
      },
    });
    const failed = await thrown.reader.snapshot(
      true,
      ["opencode-go"],
      client,
      new AbortController().signal,
    );
    expect(failed.opencodeGo).toEqual({ status: "failed" });
    expect(JSON.stringify(failed)).not.toContain(SECRET);
  });

  it("reports a missing key and a plan rejection", async () => {
    const missing = createReader({ resolveKey: async () => undefined });
    expect(
      (await missing.reader.snapshot(true, ["opencode-go"], client, new AbortController().signal))
        .opencodeGo,
    ).toEqual({ status: "missing-key" });
    const forbidden = createReader({ fetch: async () => new Response("no", { status: 403 }) });
    expect(
      (await forbidden.reader.snapshot(true, ["opencode-go"], client, new AbortController().signal))
        .opencodeGo,
    ).toEqual({ status: "forbidden" });
  });

  it("lets cancellation reject", async () => {
    const controller = new AbortController();
    controller.abort();
    const { reader: cancelled } = createReader({
      fetch: async (_url, init) => {
        expect(init.signal?.aborted).toBe(true);
        throw new DOMException("aborted", "AbortError");
      },
    });
    await expect(
      cancelled.snapshot(true, ["opencode-go"], client, controller.signal),
    ).rejects.toThrow(/aborted/i);
  });
});

describe("key resolution", () => {
  it("prefers the credential store and falls back to the environment", async () => {
    const stored = await resolveApiKey(
      {
        resolve: async (ref) => {
          expect(ref).toBe(credentialRef("OPENCODE_GO_API_KEY"));
          return { value: SECRET };
        },
      },
      "OPENCODE_GO_API_KEY",
      { OPENCODE_GO_API_KEY: "from-env" },
    );
    expect(stored).toBe(SECRET);

    const fromEnv = await resolveApiKey(
      {
        resolve: async () => undefined,
      },
      "OPENCODE_GO_API_KEY",
      { OPENCODE_GO_API_KEY: "from-env" },
    );
    expect(fromEnv).toBe("from-env");
    expect(await resolveApiKey(undefined, "not a name", { "not a name": SECRET })).toBeUndefined();
  });
});

describe("config", () => {
  it("rejects a non-http usage url", () => {
    expect(
      usageConfig({ usageUrl: "file:///tmp/usage", apiKeyEnv: "bad name", timeoutMs: 10 }),
    ).toEqual({
      usageUrl: "https://opencode.ai/zen/go/v1/usage",
      apiKeyEnv: "OPENCODE_GO_API_KEY",
      timeoutMs: 1000,
    });
  });
});

describe("usage source registry", () => {
  it("replaces an id and ignores the previous disposer", () => {
    const registry = new UsageSourceRegistry();
    const first = {
      id: "xai-supergrok",
      providers: ["xai-supergrok"],
      read: async () => ({ status: "failed" as const }),
    };
    const second = { ...first };
    const dropFirst = registry.register(first);
    const dropSecond = registry.register(second);
    dropFirst();
    expect(registry.list()).toEqual([second]);
    dropSecond();
    expect(registry.list()).toEqual([]);
  });

  it("drops fields that are not part of a reading", () => {
    const reading = normalizeSourceReading({
      status: "ready",
      title: "SuperGrok",
      token: SECRET,
      windows: [
        { id: "week", label: "week", usedPercent: 10, remainingPercent: 90, token: SECRET },
      ],
    });
    expect(reading).toEqual({
      status: "ready",
      title: "SuperGrok",
      windows: [{ id: "week", label: "week", usedPercent: 10, remainingPercent: 90 }],
    });
    expect(JSON.stringify(reading)).not.toContain(SECRET);
  });
});

describe("remote marker", () => {
  it("exposes snapshot as a direct remote method", () => {
    const marker = Object.getOwnPropertyDescriptor(
      UsageService.prototype,
      "@deepseek-ai/dsh-typert-protocol/remote-methods",
    )?.value as { methods?: { method?: string }[] } | undefined;
    expect(marker?.methods?.map((method) => method.method)).toEqual(["snapshot"]);
  });
});
