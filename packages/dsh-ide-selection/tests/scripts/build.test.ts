// ABOUTME: Verifies package identity, localized detail documents, and browser registration.
// ABOUTME: Catches metadata and scoped-name mismatches in the published dsh plugin.
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

const packageRoot = new URL("../../", import.meta.url);
const manifest = JSON.parse(await readFile(new URL("package.json", packageRoot), "utf8")) as {
  name: string;
  exports: { "./client": string };
  files: string[];
};
const run = promisify(execFile);

interface ClientRegistration {
  id: string;
  factory: unknown;
}

describe("dsh package identity", () => {
  it("publishes a separate detail document for each supported language", async () => {
    const languages = ["en", "zh"];
    const documents = new Set<string>();
    for (const language of languages) {
      const locale = JSON.parse(
        await readFile(new URL(`locale/${language}.json`, packageRoot), "utf8"),
      ) as { meta?: { detail?: string } };
      const detail = locale.meta?.detail;
      expect(detail).toMatch(/^docs\/[^/]+\.md$/);
      expect(manifest.files).toContain(detail);
      expect((await readFile(new URL(detail!, packageRoot), "utf8")).trim()).not.toBe("");
      documents.add(detail!);
    }
    expect(documents.size).toBe(languages.length);
  });

  it("loads the package and its icon through the bundle entry's full package name", async () => {
    const patch = await readFile(new URL("cordis.patch.yml", packageRoot), "utf8");
    const specifier = patch.match(/^\s+name:\s+["']?([^"'\r\n]+)["']?$/m)?.[1];

    expect(specifier).toBe(manifest.name);
    expect(import.meta.resolve(`${specifier}/icon`)).toBe(new URL("icon.svg", packageRoot).href);
  });

  it("registers the built browser module under the manifest package name", async () => {
    await run(process.execPath, ["scripts/build.mjs"], { cwd: fileURLToPath(packageRoot) });
    const client = await readFile(new URL(manifest.exports["./client"], packageRoot), "utf8");
    const registrations: ClientRegistration[] = [];
    runInNewContext(client, {
      window: {
        __ModuleLoader__: {
          load: (registration: ClientRegistration) => registrations.push(registration),
        },
      },
    });

    expect(registrations).toHaveLength(1);
    expect(registrations[0]?.id).toBe(manifest.name);
    expect(typeof registrations[0]?.factory).toBe("function");
  });
});
