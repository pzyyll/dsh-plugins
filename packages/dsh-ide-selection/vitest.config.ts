// ABOUTME: Configure Vitest to run TypeScript tests from tests directories in Node.js.
// ABOUTME: Exclude generated output and isolated worktrees from test discovery.
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["**/tests/**/*.test.ts"],
    exclude: [...configDefaults.exclude, "**/dist/**", "**/.worktrees/**"],
  },
});
