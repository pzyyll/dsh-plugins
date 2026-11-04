// ABOUTME: Check IDE status labels in English and Chinese.
// ABOUTME: Preserve the reconnect entry after disconnecting and hide it on stream failure.
import { describe, expect, it } from "vitest";
import { fallbackText, zh } from "../../src/client/locales.js";
import { statusButtonText, statusButtonVisible } from "../../src/client/status-label.js";

const chinese = (key: string, params?: Record<string, unknown>) => {
  const template = zh[key as keyof typeof zh] ?? key;
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.hasOwn(params, name) ? String(params[name]) : match,
  );
};

describe("IDE status labels", () => {
  it("keeps the reconnect entry when integration is disabled and hides it on stream failure", () => {
    expect(statusButtonVisible(undefined)).toBe(true);
    expect(statusButtonVisible({ connected: false })).toBe(true);
    expect(statusButtonVisible({ connected: true, lines: 1 })).toBe(true);
    expect(statusButtonVisible({ connected: false, disabled: true })).toBe(true);
    expect(statusButtonVisible({ connected: false }, true)).toBe(false);
    expect(statusButtonVisible(undefined, true)).toBe(false);
  });

  it("keeps the original icon visible before connecting and after disconnecting", () => {
    expect(statusButtonText(undefined, fallbackText)).toBe("⧉");
    expect(statusButtonText({}, fallbackText)).toBe("⧉");
    expect(
      statusButtonText({ connected: false, lines: 3, text: "⧉ 3 Lines Selected" }, chinese),
    ).toBe("⧉");
    expect(statusButtonText({ connected: true, lines: 0 }, chinese)).toBe("⧉");
  });

  it("uses the active language without replacing the icon", () => {
    expect(statusButtonText({ lines: 0, text: "⧉" }, chinese)).toBe("⧉");
    expect(statusButtonText({ lines: 1, text: "⧉ Selected" }, chinese)).toBe("⧉ 已选中");
    expect(statusButtonText({ lines: 3, text: "⧉ 3 Lines Selected" }, chinese)).toBe(
      "⧉ 已选中 3 行",
    );
    expect(statusButtonText({ text: "⧉ Selected" }, fallbackText)).toBe("⧉ Selected");
  });
});
