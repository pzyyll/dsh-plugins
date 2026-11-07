// ABOUTME: Checks opt-in sidebar usage through real Cordis configuration and services.
// ABOUTME: Configuration values reach account status without credentials or network requests.

import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { Context } from "@deepseek-ai/cordis";
import { LlmRuntime } from "@deepseek-ai/dsh-llm";
import { SuperGrokAuthService } from "../src/auth-service.ts";
import { Config } from "../src/config.ts";
import * as plugin from "../src/index.ts";

test("sidebar usage defaults to off and requires a boolean configuration value", () => {
  const field = Config.dict?.showSidebarUsage;
  assert.ok(field);
  assert.equal(field.meta.volatile, true);
  assert.equal(Config().showSidebarUsage.get(), false);
  assert.equal(Config({ showSidebarUsage: true }).showSidebarUsage.get(), true);
  assert.equal(Config({ showSidebarUsage: false }).showSidebarUsage.get(), false);
  assert.throws(() => Config({ showSidebarUsage: "true" } as never));
});

test("Grok-only visibility defaults to off and requires a volatile boolean", () => {
  const field = Config.dict?.onlyShowUsageForGrok;
  assert.ok(field);
  assert.equal(field.meta.volatile, true);
  assert.equal(Config().onlyShowUsageForGrok.get(), false);
  assert.equal(Config({ onlyShowUsageForGrok: true }).onlyShowUsageForGrok.get(), true);
  assert.equal(Config({ onlyShowUsageForGrok: false }).onlyShowUsageForGrok.get(), false);
  assert.throws(() => Config({ onlyShowUsageForGrok: "true" } as never));
});

test("plugin configuration reaches account status through the authentication service", async (t) => {
  const previousHome = process.env.DSH_HOME;
  const home = mkdtempSync(join(tmpdir(), "dsh-xai-config-"));
  process.env.DSH_HOME = home;
  t.after(() => {
    if (previousHome === undefined) delete process.env.DSH_HOME;
    else process.env.DSH_HOME = previousHome;
    rmSync(home, { recursive: true, force: true });
  });
  const ctx = new Context();
  t.after(() => ctx.fiber.dispose());
  await ctx.plugin(LlmRuntime).await();
  const fiber = ctx.plugin(plugin, {});
  await fiber.await();
  const service = ctx.get("xaiSupergrok") as SuperGrokAuthService;
  assert.ok(service instanceof SuperGrokAuthService);
  const initial = service.status();
  assert.equal(initial.showSidebarUsage, false);
  assert.equal(initial.onlyShowUsageForGrok, false);
  assert.equal(initial.signedIn, false);

  for (const onlyGrok of [true, false]) {
    for (const enabled of [true, false]) {
      await fiber.update({ showSidebarUsage: enabled, onlyShowUsageForGrok: onlyGrok });
      const current = ctx.get("xaiSupergrok") as SuperGrokAuthService;
      assert.ok(current instanceof SuperGrokAuthService);
      const status = current.status();
      assert.equal(status.showSidebarUsage, enabled);
      assert.equal(status.onlyShowUsageForGrok, onlyGrok);
      assert.equal(status.signedIn, initial.signedIn);
      assert.deepEqual(status.models, initial.models);
    }
  }
});
