// ABOUTME: Pack the built VS Code extension into a versioned VSIX.
// ABOUTME: Skip dependency collection because esbuild already bundled the runtime.
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const EXTENSION_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const vsceManifestPath = require.resolve("@vscode/vsce/package.json");
const vsceManifest = JSON.parse(readFileSync(vsceManifestPath, "utf8"));
const vsceBinRel = typeof vsceManifest.bin === "string" ? vsceManifest.bin : vsceManifest.bin.vsce;
const vsceBin = join(dirname(vsceManifestPath), vsceBinRel);
const manifest = JSON.parse(readFileSync(join(EXTENSION_ROOT, "package.json"), "utf8"));
const outFile = join("dist", `${manifest.name}-${manifest.version}.vsix`);

mkdirSync(join(EXTENSION_ROOT, "dist"), { recursive: true });
await run(process.execPath, [
  vsceBin,
  "package",
  "--no-dependencies",
  "--allow-missing-repository",
  "--out",
  outFile,
]);

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: EXTENSION_ROOT, stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with code ${code ?? "unknown"}`));
    });
  });
}
