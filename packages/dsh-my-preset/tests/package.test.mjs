// ABOUTME: Verifies exported locale metadata and independently published detail documents.
// ABOUTME: Keeps the data-only preset bundle free of missing or README-based plugin details.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const PACKAGE_ROOT = new URL("../", import.meta.url);
const MANIFEST = JSON.parse(await readFile(new URL("package.json", PACKAGE_ROOT), "utf8"));
const LANGUAGES = ["en", "zh"];

test("the bundle exports its locale metadata", () => {
  for (const language of LANGUAGES) {
    assert.equal(
      import.meta.resolve(MANIFEST.name + "/locale/" + language + ".json"),
      new URL("locale/" + language + ".json", PACKAGE_ROOT).href,
    );
  }
});

test("each locale selects its own published detail document", async () => {
  const documents = new Set();
  for (const language of LANGUAGES) {
    const locale = JSON.parse(
      await readFile(new URL("locale/" + language + ".json", PACKAGE_ROOT), "utf8"),
    );
    const detail = locale.meta?.detail;
    assert.equal(typeof detail, "string", language + " must declare a detail document");
    assert.match(detail, /^docs\/[^/]+\.md$/);
    assert.ok(MANIFEST.files.includes(detail), detail + " must be published");
    assert.ok((await readFile(new URL(detail, PACKAGE_ROOT), "utf8")).trim());
    documents.add(detail);
  }
  assert.equal(documents.size, LANGUAGES.length);
});
