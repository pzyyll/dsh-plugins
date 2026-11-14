// ABOUTME: Expose one host snapshot of DeepSeek balance and OpenCode Go quota.
// ABOUTME: Source-mode Remote reads the parameter names, so they stay explicit.

import type { Context } from "@deepseek-ai/cordis";
import { TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";
import { usageChannels, type UsageSnapshot } from "../shared/model.js";
import { usageConfig, type Config } from "./config.js";
import { resolveApiKey, type CredentialStore } from "./keys.js";
import {
  accountClient,
  readDeepseek,
  UsageReader,
  CACHE_MS,
  type DeepseekAccountApi,
} from "./read.js";

const REMOTE_METHODS = "@deepseek-ai/dsh-typert-protocol/remote-methods";

function optionalService<T>(ctx: Context, name: string): T | undefined {
  try {
    return ctx.get(name) as T | undefined;
  } catch {
    return undefined;
  }
}

function exposeRemoteMethod(prototype: object, method: string): void {
  const property = Object.getOwnPropertyDescriptor(prototype, REMOTE_METHODS);
  const previous = property?.value as { methods?: readonly object[] } | undefined;
  const methods = Array.isArray(previous?.methods) ? previous.methods : [];
  Object.defineProperty(prototype, REMOTE_METHODS, {
    configurable: true,
    value: Object.freeze({
      version: 1,
      methods: Object.freeze([
        ...methods,
        Object.freeze({ method, invocation: Object.freeze({ kind: "direct" }) }),
      ]),
    }),
  });
}

/** Host Remote `dshUsages/snapshot` for the sidebar. */
export class UsageService extends TypertRemoteService {
  private readonly reader: UsageReader;

  constructor(ctx: Context, config: Config) {
    super(ctx, "dshUsages");
    const resolved = usageConfig(config);
    this.reader = new UsageReader({
      usageUrl: resolved.usageUrl,
      timeoutMs: resolved.timeoutMs,
      cacheMs: CACHE_MS,
      now: () => Date.now(),
      resolveKey: () =>
        resolveApiKey(
          optionalService<CredentialStore>(ctx, "credentials"),
          resolved.apiKeyEnv,
          process.env,
        ),
      fetch: (url, init) => fetch(url, init),
      readAccount: (client) =>
        readDeepseek(optionalService<DeepseekAccountApi>(ctx, "deepseekAccount"), client),
    });
  }

  snapshot(
    version: string,
    locale: string,
    timezoneOffsetSeconds: number,
    refresh: boolean,
    channels: readonly string[] | undefined,
    signal: AbortSignal,
  ): Promise<UsageSnapshot> {
    return this.reader.snapshot(
      refresh === true,
      usageChannels(channels),
      accountClient(version, locale, timezoneOffsetSeconds),
      signal,
    );
  }
}

exposeRemoteMethod(UsageService.prototype, "snapshot");
