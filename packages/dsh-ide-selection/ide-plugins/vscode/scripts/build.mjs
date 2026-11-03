// ABOUTME: Bundle the VS Code extension from its TypeScript entry.
// ABOUTME: Keep vscode external and include the shared IDE transport plus ws.
import { build } from "esbuild";
import { rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const EXTENSION_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const NODE_TARGET = "node24";
const PRODUCTION = process.argv.includes("--production");
const BUNDLE_HEADER =
  "// ABOUTME: Generated VS Code extension bundle.\n// ABOUTME: Rebuild with mise run compile:vsix; see source and third-party notices for details.";

await rm(join(EXTENSION_ROOT, "out"), { recursive: true, force: true });
await build({
  absWorkingDir: EXTENSION_ROOT,
  entryPoints: ["src/extension.ts"],
  outfile: "out/extension.js",
  bundle: true,
  platform: "node",
  format: "cjs",
  target: NODE_TARGET,
  external: ["vscode"],
  banner: { js: BUNDLE_HEADER },
  sourcemap: !PRODUCTION,
  minify: PRODUCTION,
  sourcesContent: false,
  legalComments: PRODUCTION ? "none" : "eof",
});
