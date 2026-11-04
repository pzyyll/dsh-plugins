// ABOUTME: Check that menu and status copy follow the active translator.
// ABOUTME: Keep other commands and unlabeled status events unchanged.
import { describe, expect, it } from "vitest";
import { fallbackText, zh } from "./locales.js";
import {
  localizeCommandList,
  localizeCommandListResult,
  localizeRemoteCommandList,
  statusButtonText,
} from "./ui-copy.js";

const chinese = (key: string, params?: Record<string, unknown>) => {
  const template = zh[key as keyof typeof zh] ?? key;
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.hasOwn(params, name) ? String(params[name]) : match,
  );
};

describe("IDE selection UI copy", () => {
  it("replaces only the select-ide description, and reads it again later", () => {
    let language = "en";
    const rows = localizeCommandList(
      [
        { name: "model", description: "Select the model" },
        {
          name: "select-ide",
          description: "Choose which local IDE supplies selection context for this session",
        },
      ],
      () =>
        language === "zh"
          ? chinese("command.description")
          : "Choose which local IDE supplies selection context for this session",
    );

    expect(rows[0]?.description).toBe("Select the model");
    expect(rows[1]?.description).toBe(
      "Choose which local IDE supplies selection context for this session",
    );
    language = "zh";
    expect(rows[1]?.description).toBe("选择本会话由哪个本地 IDE 提供选区");
  });

  it("translates a successful command catalog and leaves failures alone", async () => {
    const commands: { list?: (sessionId: string) => Promise<unknown> } = {
      list: async () => ({
        ok: true,
        value: [{ name: "select-ide", description: "English catalog" }],
      }),
    };
    localizeRemoteCommandList(commands, () => chinese("command.description"));
    localizeRemoteCommandList(commands, () => "second wrap");

    const result = await commands.list?.("session");
    expect(localizeCommandListResult({ ok: false, error: "nope" }, () => "unused")).toEqual({
      ok: false,
      error: "nope",
    });
    expect(result).toMatchObject({
      ok: true,
      value: [{ name: "select-ide", description: "选择本会话由哪个本地 IDE 提供选区" }],
    });
  });

  it("labels the status pill in the active language", () => {
    expect(statusButtonText({ lines: 0, text: "\u29c1" }, chinese)).toBe("\u29c1");
    expect(statusButtonText({ lines: 1, text: "\u29c1 Selected" }, chinese)).toBe("\u29c1 已选中");
    expect(statusButtonText({ lines: 3, text: "\u29c1 3 Lines Selected" }, chinese)).toBe(
      "\u29c1 已选中 3 行",
    );
    expect(statusButtonText({ text: "\u29c1 Selected" }, fallbackText)).toBe("\u29c1 Selected");
  });
});
