// ABOUTME: Resolves this plugin's Harness cache for the model catalog and agent id.
// ABOUTME: Grok Build files stay read-only; owned files live under the dsh cache.

import { dshCachePath } from "@deepseek-ai/dsh-home-paths";
import { AGENT_ID_FILE, CACHE_DIR_NAME, MODELS_CACHE_FILE } from "./constants.ts";

export function pluginCachePath(...segments: string[]): string {
  return dshCachePath(CACHE_DIR_NAME, ...segments);
}

export function modelsCachePath(): string {
  return pluginCachePath(MODELS_CACHE_FILE);
}

export function agentIdPath(): string {
  return pluginCachePath(AGENT_ID_FILE);
}
