// ABOUTME: Run the usage plugin tests from the package tests directory.
// ABOUTME: Keep generated bundles out of discovery.
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    exclude: [...configDefaults.exclude, "**/dist/**"],
  },
});
