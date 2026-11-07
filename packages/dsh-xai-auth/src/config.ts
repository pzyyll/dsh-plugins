// ABOUTME: Defines the plugin configuration shown on the Plugins page.
// ABOUTME: Floating usage is opt-in and keeps the existing configuration key for compatibility.

import type { Volatile } from "@deepseek-ai/cordis";
import z from "@deepseek-ai/schemastery";

export interface Config {
  showSidebarUsage: Volatile<boolean>;
}

const showSidebarUsage = z.boolean().default(false).volatile();
showSidebarUsage.meta.description = {
  en: "Show floating usage.",
  zh: "显示悬浮用量。",
};

export const Config = z.object({ showSidebarUsage });
