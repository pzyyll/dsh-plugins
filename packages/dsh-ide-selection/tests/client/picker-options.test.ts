// ABOUTME: Verify compact IDE labels preserve selection rules and full connection details.
// ABOUTME: Cover workspace filtering, effective selection, path shortening, and localization.
import { describe, expect, it } from "vitest";
import type {
  IdeSelectionTarget,
  IdeTargetOverview,
  IdeTargetRow,
} from "../../src/shared/target.js";
import { fallbackText, zh } from "../../src/client/locales.js";
import { pickerOptions } from "../../src/client/picker-options.js";

const REACHABLE_IDE: IdeTargetRow = {
  id: "ide-one",
  name: "Visual Studio Code",
  host: "127.0.0.1",
  port: 51_234,
  workspaceFolders: ["f:\\workspace\\my\\dsh-plugins"],
  workspaceMatched: true,
};

function overview(
  ides: readonly IdeTargetRow[] = [REACHABLE_IDE],
  selection: IdeSelectionTarget = { kind: "auto" },
): IdeTargetOverview {
  return { ides, selection, automaticId: REACHABLE_IDE.id };
}

describe("pickerOptions", () => {
  it("shows only matching IDEs without mode actions or group labels", () => {
    const rows = pickerOptions(overview(), fallbackText, true);

    expect(rows.map((row) => row.id)).toEqual(["ide-one"]);
    expect(rows[0]).toMatchObject({
      label: "Visual Studio Code",
      detail: "…\\my\\dsh-plugins",
      title: "f:\\workspace\\my\\dsh-plugins · 127.0.0.1:51234",
      active: true,
      targetId: "off",
    });
    expect(rows[0]?.group).toBeUndefined();
  });

  it.each<IdeSelectionTarget>([{ kind: "auto" }, { kind: "manual", ideId: "ide-one" }])(
    "does not mark a reachable $kind target connected before the live connection starts",
    (selection) => {
      const rows = pickerOptions(overview([REACHABLE_IDE], selection), fallbackText, false);

      expect(rows[0]).toMatchObject({ active: false, targetId: REACHABLE_IDE.id });
    },
  );

  it("updates an open list when the live connection drops and reconnects", () => {
    const targets = overview();

    expect(pickerOptions(targets, fallbackText, true)[0]).toMatchObject({
      active: true,
      targetId: "off",
    });
    expect(pickerOptions(targets, fallbackText, false)[0]).toMatchObject({
      active: false,
      targetId: REACHABLE_IDE.id,
    });
    expect(pickerOptions(targets, fallbackText, true)[0]).toMatchObject({
      active: true,
      targetId: "off",
    });
  });

  it.each<IdeSelectionTarget>([
    { kind: "auto" },
    { kind: "manual", ideId: "ide-one" },
    { kind: "off" },
  ])("keeps exactly the current $kind choice selected", (selection) => {
    const rows = pickerOptions(overview([REACHABLE_IDE], selection), fallbackText, true);
    const expectedIds = selection.kind === "off" ? [] : [REACHABLE_IDE.id];

    expect(rows.filter((row) => row.active).map((row) => row.id)).toEqual(expectedIds);
    expect(rows[0]?.targetId).toBe(selection.kind === "off" ? REACHABLE_IDE.id : "off");
  });

  it("disconnects the current IDE, switches to another, and reconnects after turning off", () => {
    const ides = [REACHABLE_IDE, { ...REACHABLE_IDE, id: "ide-two" }];
    const initial = pickerOptions(overview(ides), fallbackText, true);
    expect(initial.map((row) => row.targetId)).toEqual(["off", "ide-two"]);

    const switched = pickerOptions(
      overview(ides, { kind: "manual", ideId: "ide-two" }),
      fallbackText,
      true,
    );
    expect(switched.map((row) => row.active)).toEqual([false, true]);
    expect(switched.map((row) => row.targetId)).toEqual(["ide-one", "off"]);

    const disconnected = pickerOptions(overview(ides, { kind: "off" }), fallbackText, false);
    expect(disconnected.map((row) => row.active)).toEqual([false, false]);
    expect(disconnected.map((row) => row.targetId)).toEqual(["ide-one", "ide-two"]);
  });

  it("shortens each workspace but keeps short paths and roots intact", () => {
    const workspaces = ["/home/julian/work/app", "/work/app", "/", "C:\\"];
    const rows = pickerOptions(
      overview([{ ...REACHABLE_IDE, workspaceFolders: workspaces }]),
      fallbackText,
      true,
    );

    expect(rows[0]?.detail).toBe("…/work/app, /work/app, /, C:\\");
    expect(rows[0]?.title).toContain(workspaces.join(", "));
  });

  it("shows endpoints only when the compact name and workspace would be ambiguous", () => {
    const otherPort = 51_235;
    const rows = pickerOptions(
      overview([
        REACHABLE_IDE,
        {
          ...REACHABLE_IDE,
          id: "ide-two",
          port: otherPort,
          workspaceFolders: ["c:\\projects\\my\\dsh-plugins"],
        },
        {
          ...REACHABLE_IDE,
          id: "ide-three",
          workspaceFolders: ["f:\\workspace\\my\\another-project"],
        },
      ]),
      fallbackText,
      true,
    );

    expect(rows[0]?.detail).toBe("…\\my\\dsh-plugins · 127.0.0.1:51234");
    expect(rows[1]?.detail).toBe(`…\\my\\dsh-plugins · 127.0.0.1:${otherPort}`);
    expect(rows[2]?.detail).toBe("…\\my\\another-project");
    expect(rows[1]?.title).toContain("c:\\projects\\my\\dsh-plugins");
  });

  it("hides nonmatching IDEs without making visible workspace labels ambiguous", () => {
    const rows = pickerOptions(
      overview([REACHABLE_IDE, { ...REACHABLE_IDE, id: "outside", workspaceMatched: false }]),
      fallbackText,
      true,
    );

    expect(rows.map((row) => row.id)).toEqual(["ide-one"]);
    expect(rows[0]?.detail).toBe("…\\my\\dsh-plugins");
  });

  it.each([{ ides: [] }, { ides: [{ ...REACHABLE_IDE, workspaceMatched: false }] }])(
    "returns no rows when no IDE matches the workspace: $ides",
    ({ ides }) => {
      const rows = pickerOptions(overview(ides), fallbackText, false);

      expect(rows).toEqual([]);
    },
  );

  it("does not select a fallback row for an unavailable automatic or manual target", () => {
    for (const selection of [{ kind: "auto" }, { kind: "manual", ideId: "outside" }] as const) {
      const rows = pickerOptions(
        {
          ...overview([REACHABLE_IDE], selection),
          automaticId: "outside",
        },
        fallbackText,
        true,
      );

      expect(rows.some((row) => row.active)).toBe(false);
    }
  });

  it("keeps unknown workspace text", () => {
    const rows = pickerOptions(
      overview([{ ...REACHABLE_IDE, workspaceFolders: [] }]),
      fallbackText,
      true,
    );

    expect(rows[0]?.detail).toBe("unknown workspace");
  });

  it("uses the supplied locale for the compact labels", () => {
    const rows = pickerOptions(
      overview(),
      (key, params) => {
        const template = zh[key as keyof typeof zh];
        return template.replace(/\{(\w+)\}/g, (_match, name: string) => String(params?.[name]));
      },
      true,
    );

    expect(rows[0]?.label).toBe("Visual Studio Code");
    expect(rows[0]?.group).toBeUndefined();
    expect(zh["picker.title"]).toBe("可连接 IDE 列表");
    expect(zh["picker.connected"]).toBe("已连接");
  });
});
