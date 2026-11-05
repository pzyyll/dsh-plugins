// ABOUTME: Registers the xAI SuperGrok subscription provider and its Plugins-page sign-in.
// ABOUTME: The route uses cli-chat-proxy OAuth and stays separate from an xAI API key.

import type { Context } from "@deepseek-ai/cordis";
import { SuperGrokAuthService } from "./auth-service.ts";
import { PLUGIN_NAME } from "./constants.ts";
import { Config } from "./config.ts";

export { Config };

export const name = PLUGIN_NAME;
export const inject = ["llm"];

export function apply(ctx: Context, config: Config = Config()): void {
  ctx.plugin(SuperGrokAuthService, config);
}
