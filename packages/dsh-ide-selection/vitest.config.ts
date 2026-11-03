// ABOUTME: Configure Vitest for TypeScript tests in the Node.js environment.
// ABOUTME: Exclude generated output and isolated worktrees from test discovery.
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    exclude: [...configDefaults.exclude, "**/dist/**", "**/.worktrees/**"],
  },
});
