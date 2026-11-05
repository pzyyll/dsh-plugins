// ABOUTME: Defines the plugin configuration shown on the Plugins page.
// ABOUTME: Sidebar usage is opt-in and does not affect usage on the sign-in panel.

import type { Volatile } from "@deepseek-ai/cordis";
import z from "@deepseek-ai/schemastery";

export interface Config {
  showSidebarUsage: Volatile<boolean>;
}

const showSidebarUsage = z.boolean().default(false).volatile();
showSidebarUsage.meta.description = {
  en: "Show usage in the sidebar.",
  zh: "在侧边栏显示用量。",
};

export const Config = z.object({ showSidebarUsage });
