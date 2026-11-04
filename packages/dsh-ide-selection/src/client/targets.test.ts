// ABOUTME: Verify the picker's option rows and its host requests against fixed payloads.
// ABOUTME: Keep the browser-facing contract honest without mounting the Web shell.
import { afterEach, describe, expect, it, vi } from "vitest";
import type { IdeSelectionTarget, IdeTargetOverview, IdeTargetRow } from "../shared/target.js";
import { fallbackText } from "./locales.js";
import {
  TARGET_OVERVIEW_URL,
  TARGET_SELECT_URL,
  applyTargetChoice,
  loadTargetOverview,
  targetOptions,
} from "./targets.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

const REACHABLE_IDE: IdeTargetRow = {
  id: "ide-one",
  name: "Visual Studio Code",
  host: "127.0.0.1",
  port: 51_234,
  workspaceFolders: ["/work/app"],
  workspaceMatched: true,
};

function overview(
  options: {
    selection?: IdeSelectionTarget;
    ides?: readonly IdeTargetRow[];
    automaticId?: string | null;
  } = {},
): IdeTargetOverview {
  const automaticId = options.automaticId === undefined ? "ide-one" : options.automaticId;
  return {
    selection: options.selection ?? { kind: "auto" },
    ides: options.ides ?? [REACHABLE_IDE],
    ...(automaticId === null ? {} : { automaticId }),
  };
}

describe("targetOptions", () => {
  it("renders reachable IDEs first, then the session modes", () => {
    const rows = targetOptions(overview(), fallbackText);

    expect(rows.map((row) => row.id)).toEqual(["ide-one", "auto", "off"]);
    expect(rows[0]).toMatchObject({
      label: "Visual Studio Code",
      detail: "/work/app · 127.0.0.1:51234",
      group: { name: "ides", label: "Available IDEs" },
    });
    expect(rows[1]).toMatchObject({
      label: "Automatic (workspace match)",
      detail: "Connects to Visual Studio Code — /work/app",
      group: { name: "mode", label: "This session" },
    });
    expect(rows[2]).toMatchObject({ label: "Disable IDE integration" });
  });

  it("shows nonmatching reachable IDEs disabled while keeping matching and mode rows selectable", () => {
    const rows = targetOptions(
      overview({
        ides: [
          REACHABLE_IDE,
          {
            id: "ide-outside",
            name: "Another IDE",
            host: "remote.example",
            port: 51_235,
            workspaceFolders: ["/work/other"],
            workspaceMatched: false,
          },
        ],
      }),
      fallbackText,
    );

    expect(rows.map((row) => row.id)).toEqual(["ide-one", "ide-outside", "auto", "off"]);
    expect(rows[0]).toMatchObject({ detail: "/work/app · 127.0.0.1:51234" });
    expect(rows[0]).not.toHaveProperty("disabled");
    expect(rows[1]).toMatchObject({
      disabled: true,
      detail: "/work/other · remote.example:51235 · Outside this session's workspace",
    });
    expect(rows.find((row) => row.id === "auto")?.disabled).toBeUndefined();
    expect(rows.find((row) => row.id === "off")?.disabled).toBeUndefined();
  });

  it("marks only the row that matches the session's current target", () => {
    const automatic = targetOptions(overview(), fallbackText);
    expect(automatic.filter((row) => row.active).map((row) => row.id)).toEqual(["auto"]);

    const manual = targetOptions(
      overview({ selection: { kind: "manual", ideId: "ide-one" } }),
      fallbackText,
    );
    expect(manual.filter((row) => row.active).map((row) => row.id)).toEqual(["ide-one"]);

    const off = targetOptions(overview({ selection: { kind: "off" } }), fallbackText);
    expect(off.filter((row) => row.active).map((row) => row.id)).toEqual(["off"]);
  });

  it("explains a missing automatic target and unknown workspaces", () => {
    const rows = targetOptions(
      overview({
        automaticId: null,
        ides: [
          {
            id: "ide-two",
            name: "Visual Studio Code",
            host: "127.0.0.1",
            port: 1,
            workspaceFolders: [],
            workspaceMatched: false,
          },
        ],
      }),
      fallbackText,
    );

    expect(rows[0]?.detail).toBe(
      "unknown workspace · 127.0.0.1:1 · Outside this session's workspace",
    );
    expect(rows[0]?.disabled).toBe(true);
    expect(rows[1]?.detail).toBe("No workspace-matching IDE is reachable");
  });

  it("does not show a disabled stale automatic target", () => {
    const rows = targetOptions(
      overview({
        ides: [{ ...REACHABLE_IDE, workspaceMatched: false }],
      }),
      fallbackText,
    );

    expect(rows[1]?.detail).toBe("No workspace-matching IDE is reachable");
  });

  it("uses a mounted locale dictionary when one is supplied", () => {
    const rows = targetOptions(overview(), (key) => `zh:${key}`);

    expect(rows[1]?.label).toBe("zh:auto.label");
  });
});

describe("host requests", () => {
  it("loads and validates the overview payload", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => overview(),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const payload = await loadTargetOverview("session one", new AbortController().signal);

    expect(payload.ides).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledWith(
      `${TARGET_OVERVIEW_URL}?session=session%20one`,
      expect.objectContaining({ credentials: "same-origin" }),
    );
  });

  it("rejects an unexpected payload and a failed request", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ ides: "nope" }) })),
    );
    await expect(loadTargetOverview("s", new AbortController().signal)).rejects.toThrow(
      /unexpected payload/,
    );

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 404, json: async () => ({ error: "gone" }) })),
    );
    await expect(loadTargetOverview("s", new AbortController().signal)).rejects.toThrow("gone");
  });

  it("posts the row id as a manual, automatic, or disabled target", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => ({
      ok: true,
      status: 200,
      json: async () => ({}),
    }));
    vi.stubGlobal("fetch", fetchMock);

    await applyTargetChoice("session-one", "ide-one");
    await applyTargetChoice("session-one", "auto");
    await applyTargetChoice("session-one", "off");

    const bodies = fetchMock.mock.calls.map((call) =>
      JSON.parse((call[1] as { body: string }).body),
    );
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${TARGET_SELECT_URL}?session=session-one`);
    expect(bodies).toEqual([
      { kind: "manual", ideId: "ide-one" },
      { kind: "auto" },
      { kind: "off" },
    ]);
  });

  it("cancels an in-flight choice when its picker closes", async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), {
            once: true,
          });
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const choice = applyTargetChoice("s", "ide-one", fallbackText, controller.signal);
    const rejected = expect(choice).rejects.toThrow("picker closed");
    controller.abort(new Error("picker closed"));

    await rejected;
    expect(fetchMock).toHaveBeenCalledWith(
      `${TARGET_SELECT_URL}?session=s`,
      expect.objectContaining({ signal: controller.signal }),
    );
  });

  it("surfaces the host explanation when a choice is refused", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 409,
        json: async () => ({ error: "that IDE is no longer reachable" }),
      })),
    );

    await expect(applyTargetChoice("s", "ide-one")).rejects.toThrow(/no longer reachable/);
  });
});
