// ABOUTME: Builds the dsh host plugin as a Node.js ES module at dist/index.js.
// ABOUTME: Runtime peer dependencies stay external so dsh supplies shared services.

import { defineConfig, rspack } from "@rsbuild/core";

const HOST_BANNER = [
  "// ABOUTME: Registers the xAI SuperGrok subscription provider in dsh.",
  "// ABOUTME: Built by Rsbuild; runtime peer dependencies are supplied by dsh.",
].join("\n");

export default defineConfig({
  source: {
    entry: { index: "./src/index.ts" },
  },
  output: {
    target: "node",
    module: true,
    autoExternal: true,
    distPath: { root: "dist" },
    filename: { js: "[name].js" },
    minify: false,
  },
  tools: {
    rspack: {
      output: { library: { type: "module" } },
      plugins: [new rspack.BannerPlugin({ banner: HOST_BANNER, raw: true })],
    },
  },
});
