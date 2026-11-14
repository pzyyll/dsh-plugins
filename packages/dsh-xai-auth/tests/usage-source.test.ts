// ABOUTME: Checks SuperGrok delegation onto a usage hub without sharing tokens.
// ABOUTME: The hub is a structural stub. This package does not import dsh-usages.

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  attachUsageSource,
  usageSourceReading,
  type ContributedSource,
} from "../src/usage-source.ts";

const SECRET = "super-secret-token";

const source: ContributedSource = {
  id: "xai-supergrok",
  providers: ["xai-supergrok"],
  read: async () => ({ status: "signed-out" }),
};

test("a missing hub is not delegated", () => {
  const attached = attachUsageSource(
    { delegated: false, release: undefined, hub: undefined },
    undefined,
    source,
  );
  assert.equal(attached.delegated, false);
  assert.equal(attached.release, undefined);
});

test("a present hub registers once and a later absence releases it", () => {
  let registrations = 0;
  let released = 0;
  const hub = {
    register(registered: ContributedSource) {
      registrations += 1;
      assert.equal(registered.id, "xai-supergrok");
      assert.deepEqual(registered.providers, ["xai-supergrok"]);
      return () => {
        released += 1;
      };
    },
  };
  const first = attachUsageSource(
    { delegated: false, release: undefined, hub: undefined },
    hub,
    source,
  );
  const second = attachUsageSource(first, hub, source);
  assert.equal(registrations, 1);
  assert.equal(second.delegated, true);
  assert.equal(second, first);
  const replacement = { register: hub.register };
  const again = attachUsageSource(second, replacement, source);
  assert.equal(registrations, 2);
  assert.equal(released, 1);
  assert.equal(again.delegated, true);
  const gone = attachUsageSource(again, undefined, source);
  assert.equal(gone.delegated, false);
  assert.equal(released, 2);
});

test("a credit window does not carry the access token", () => {
  const reading = usageSourceReading({
    signedIn: true,
    usage: {
      onDemandDisabled: false,
      unified: false,
      products: [],
      periodKind: "week",
      periodEnd: "2026-04-08T00:00:00.000Z",
      credits: { percent: 12.5, tone: "success" },
    },
  });
  assert.equal(reading.status, "ready");
  if (reading.status !== "ready") return;
  assert.equal(reading.title, "SuperGrok");
  assert.equal(reading.windows[0]?.id, "week");
  assert.equal(reading.windows[0]?.remainingPercent, 87.5);
  assert.equal(reading.windows[0]?.resetsAt, "2026-04-08T00:00:00.000Z");
  assert.equal(JSON.stringify(reading).includes(SECRET), false);
});

test("signed out and a failed meter stay free of credentials", () => {
  assert.deepEqual(usageSourceReading({ signedIn: false, error: SECRET }), {
    status: "signed-out",
  });
  assert.deepEqual(usageSourceReading({ signedIn: true, error: SECRET }), { status: "failed" });
  assert.equal(
    JSON.stringify(usageSourceReading({ signedIn: true, error: SECRET })).includes(SECRET),
    false,
  );
});
