// ABOUTME: Verify live localization of select-ide command descriptions.
// ABOUTME: Preserve other commands, failed requests, and invalid catalog responses.
import { describe, expect, it } from "vitest";
import { fallbackText, zh } from "../../src/client/locales.js";
import { localizeRemoteCommandList } from "../../src/client/command-localization.js";

describe("IDE command localization", () => {
  it("localizes only select-ide, keeps cached descriptions live, and wraps once", async () => {
    let language = "en";
    const commands = {
      list: async (_sessionId: string) => ({
        ok: true,
        value: [
          { name: "model", description: "Select the model" },
          {
            name: "select-ide",
            description: "Choose which local IDE supplies selection context for this session",
          },
        ],
      }),
    };
    localizeRemoteCommandList(commands, () =>
      language === "zh" ? zh["command.description"] : fallbackText("command.description"),
    );
    localizeRemoteCommandList(commands, () => "second wrap");
    const { value: rows } = await commands.list("session");

    expect(rows[0]?.description).toBe("Select the model");
    expect(rows[1]?.description).toBe(
      "Choose which local IDE supplies selection context for this session",
    );
    language = "zh";
    expect(rows[1]?.description).toBe("选择本会话由哪个本地 IDE 提供选区");
  });

  it.each([null, { ok: false, error: "nope" }, { ok: true, value: "unexpected" }])(
    "leaves a failed or invalid catalog unchanged: %j",
    async (payload) => {
      const commands = { list: async (_sessionId: string) => payload };
      localizeRemoteCommandList(commands, () => "unused");
      expect(await commands.list("session")).toBe(payload);
    },
  );

  it("preserves a rejected catalog request", async () => {
    const failure = new Error("connection closed");
    const commands = {
      list: async (_sessionId: string) => {
        throw failure;
      },
    };
    localizeRemoteCommandList(commands, () => "unused");
    await expect(commands.list("session")).rejects.toBe(failure);
  });
});
