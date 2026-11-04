// ABOUTME: Verify plugin configuration fails before it registers runtime effects.
// ABOUTME: Keep invalid timeouts, text budgets, and ambiguous lock paths out of dsh turns.
import { Context } from "@deepseek-ai/cordis";
import { describe, expect, it } from "vitest";
import { apply } from "../../src/dsh/index.js";

describe("IDE selection configuration", () => {
  it.each([
    { timeoutMs: 0 },
    { timeoutMs: -1 },
    { timeoutMs: 2_147_483_648 },
    { timeoutMs: 0.5 },
    { maxAgeMs: -1 },
    { maxChars: 0 },
    { maxChars: Number.NaN },
    { lockDir: "relative/lock" },
    { lockDir: "" },
  ])("rejects invalid configuration: %j", (config) => {
    expect(() => apply(new Context(), config)).toThrow();
  });
});
