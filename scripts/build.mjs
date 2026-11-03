// ABOUTME: Build the dsh plugin and the local VS Code extension from TypeScript.
// ABOUTME: Keep host-owned dsh modules external and include the IDE transport in each bundle.
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
    entryPoints: ["ide-plugins/vscode/src/extension.ts"],
    outfile: "ide-plugins/vscode/dist/extension.cjs",
    bundle: true,
    platform: "node",
    format: "cjs",
    target: NODE_TARGET,
    external: ["vscode"],
    banner: { js: BUNDLE_HEADER },
    sourcemap: true,
  }),
]);
