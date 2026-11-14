// ABOUTME: Build the usage plugin host and its browser client.
// ABOUTME: Keep host-owned dsh modules external. The client loads through ModuleLoader.
import { build } from "esbuild";
import { readFile } from "node:fs/promises";

const { name: packageName } = JSON.parse(
  await readFile(new URL("../package.json", import.meta.url), "utf8"),
);
const BUNDLE_HEADER =
  "// ABOUTME: Generated usage plugin bundle.\n// ABOUTME: Rebuild with mise run build; see source for details.";

await Promise.all([
  build({
    entryPoints: ["src/index.ts"],
    outfile: "dist/index.js",
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node24",
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
    external: ["react", "react/jsx-runtime"],
    banner: {
      js: `${BUNDLE_HEADER}\nwindow.__ModuleLoader__.load({ id: ${JSON.stringify(packageName)}, factory: (require) => {\nvar module = { exports: {} };`,
    },
    footer: { js: "return module.exports; } });" },
    sourcemap: true,
  }),
]);
