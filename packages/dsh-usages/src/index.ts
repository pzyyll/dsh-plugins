// ABOUTME: Register the sidebar usage snapshot on the host.
// ABOUTME: The browser half renders it and never sees the OpenCode key.

import type { Context } from "@deepseek-ai/cordis";
import { usageConfig, type Config } from "./host/config.js";
import { UsageService } from "./host/service.js";

export { Config } from "./host/config.js";

export const name = "@balaenis/dsh-usages";

export function apply(ctx: Context, config?: Config): void {
  ctx.plugin(UsageService, usageConfig(config));
}
