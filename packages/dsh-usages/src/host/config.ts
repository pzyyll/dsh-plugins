// ABOUTME: Plugin settings for the OpenCode usage endpoint and its timeout.
// ABOUTME: Defaults match the official Go quota route and the configured API-key name.

import z from "@deepseek-ai/schemastery";
import { isRecord } from "../shared/model.js";

export interface Config {
  usageUrl: string;
  apiKeyEnv: string;
  timeoutMs: number;
}

export const DEFAULT_USAGE_URL = "https://opencode.ai/zen/go/v1/usage";
export const DEFAULT_API_KEY_ENV = "OPENCODE_GO_API_KEY";
export const DEFAULT_TIMEOUT_MS = 15_000;

const usageUrl = z.string().default(DEFAULT_USAGE_URL);
usageUrl.meta.description = {
  en: "OpenCode Go usage endpoint.",
  zh: "OpenCode Go 用量地址。",
};

const apiKeyEnv = z.string().default(DEFAULT_API_KEY_ENV);
apiKeyEnv.meta.description = {
  en: "Environment name of the OpenCode Go API key.",
  zh: "OpenCode Go API 密钥的环境变量名。",
};

const timeoutMs = z.number().default(DEFAULT_TIMEOUT_MS);
timeoutMs.meta.description = {
  en: "Usage request timeout in milliseconds.",
  zh: "用量请求超时，单位毫秒。",
};

export const Config: z<Config> = z.object({ usageUrl, apiKeyEnv, timeoutMs });

const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

function httpUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

/** Fill missing or rejected settings without trusting the raw patch object. */
export function usageConfig(config: unknown): Config {
  const record = isRecord(config) ? config : {};
  const timeout =
    typeof record.timeoutMs === "number" && Number.isFinite(record.timeoutMs)
      ? Math.min(60_000, Math.max(1000, Math.trunc(record.timeoutMs)))
      : DEFAULT_TIMEOUT_MS;
  return {
    usageUrl: httpUrl(record.usageUrl) ?? DEFAULT_USAGE_URL,
    apiKeyEnv:
      typeof record.apiKeyEnv === "string" && ENV_NAME.test(record.apiKeyEnv)
        ? record.apiKeyEnv
        : DEFAULT_API_KEY_ENV,
    timeoutMs: timeout,
  };
}
