// ABOUTME: Checks package entries, localized detail documents, and native Node.js loading.
// ABOUTME: A real Rsbuild bundle loads from node_modules with runtime peers kept external.

import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRsbuild, loadConfig } from "@rsbuild/core";

const PROJECT_ROOT = fileURLToPath(new URL("..", import.meta.url));
const HOST_ENTRY = "./dist/index.js";

test("the package exposes the compiled host entry and keeps the client entry", () => {
  const manifest = JSON.parse(readFileSync(join(PROJECT_ROOT, "package.json"), "utf8"));
  assert.equal(manifest.main, HOST_ENTRY);
  assert.equal(manifest.exports["."], HOST_ENTRY);
  assert.equal(manifest.exports["./client"], "./lib/client.js");
  assert.ok(manifest.files.includes("dist"));
  assert.ok(!manifest.files.includes("src"));
  assert.equal(manifest.scripts?.prepare, undefined);
});

test("localized detail documents exist and are included in the published package", () => {
  const manifest = JSON.parse(readFileSync(join(PROJECT_ROOT, "package.json"), "utf8"));
  const documents = new Set<string>();
  const languages = ["en", "zh"];
  for (const language of languages) {
    const locale = JSON.parse(
      readFileSync(join(PROJECT_ROOT, "locale", language + ".json"), "utf8"),
    );
    const detail = locale.meta?.detail;
    assert.equal(typeof detail, "string", language + " must declare a detail document");
    assert.match(detail, /^docs\/[^/]+\.md$/);
    assert.ok(manifest.files.includes(detail), detail + " must be published");
    assert.ok(
      readFileSync(join(PROJECT_ROOT, detail), "utf8").trim(),
      detail + " must not be empty",
    );
    documents.add(detail);
  }
  assert.equal(documents.size, languages.length, "Each language must have its own document");
});

test("the bundle patch loads the published package name", () => {
  const manifest = JSON.parse(readFileSync(join(PROJECT_ROOT, "package.json"), "utf8"));
  const patch = readFileSync(join(PROJECT_ROOT, "cordis.patch.yml"), "utf8");
  const specifier = patch.match(/^\s+name:\s+["']?([^"'\r\n]+)["']?$/m)?.[1];

  assert.equal(specifier, manifest.name);
  assert.equal(import.meta.resolve(specifier!), pathToFileURL(join(PROJECT_ROOT, HOST_ENTRY)).href);
});

test("the Rsbuild host bundle loads from node_modules with external runtime peers", async (t) => {
  const temp = mkdtempSync(join(PROJECT_ROOT, "node_modules", ".dsh-xai-build-"));
  t.after(() => rmSync(temp, { recursive: true, force: true }));
  const outputDir = join(temp, "dist");
  const { content } = await loadConfig({ cwd: PROJECT_ROOT });
  const rsbuild = await createRsbuild({
    cwd: PROJECT_ROOT,
    config: {
      ...content,
      mode: "production",
      output: { ...content.output, distPath: { root: outputDir } },
    },
  });
  await rsbuild.build();

  assert.deepEqual(readdirSync(outputDir), ["index.js"]);
  const entry = join(outputDir, "index.js");
  const code = readFileSync(entry, "utf8");
  assert.match(code, /^\/\/ ABOUTME: .*\n\/\/ ABOUTME: /);
  assert.match(code, /from ['"]@deepseek-ai\/dsh-typert-protocol['"]/);
  assert.match(code, /from ['"]@earendil-works\/pi-ai\/models['"]/);
  assert.match(code, /from ['"]@earendil-works\/pi-ai\/api\/openai-responses\.lazy['"]/);
  const plugin = await import(pathToFileURL(entry).href);
  assert.equal(plugin.name, "dsh-xai-auth");
  assert.deepEqual(plugin.inject, ["llm"]);
  assert.equal(typeof plugin.apply, "function");
});
