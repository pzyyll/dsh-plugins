// ABOUTME: Build the dsh plugin and its browser client from TypeScript.
// ABOUTME: Keep host-owned dsh modules external. The VS Code extension builds separately.
import { build } from "esbuild";

const NODE_TARGET = "node24";
const BUNDLE_HEADER =
  "// ABOUTME: Generated IDE selection integration bundle.\n// ABOUTME: Rebuild with pnpm build; see source and third-party notices for details.";

await Promise.all([
  build({
    entryPoints: ["src/dsh/index.ts"],
    outfile: "dist/index.js",
    bundle: true,
    platform: "node",
    format: "esm",
    target: NODE_TARGET,
    packages: "external",
    banner: { js: BUNDLE_HEADER },
    sourcemap: true,
  }),
  build({
    entryPoints: ["src/client/index.ts"],
    outfile: "dist/client.js",
    bundle: true,
    platform: "browser",
    format: "cjs",
    target: "es2022",
    jsx: "automatic",
    external: [
      "react",
      "react/jsx-runtime",
      "@deepseek-ai/cordis",
      "@deepseek-ai/dsh-client-ui-primitives",
    ],
    banner: {
      js: `${BUNDLE_HEADER}\nwindow.__ModuleLoader__.load({ id: "dsh-ide-selection", factory: (require) => {\nvar module = { exports: {} };`,
    },
    footer: { js: "return module.exports; } });" },
    sourcemap: true,
  }),
]);
