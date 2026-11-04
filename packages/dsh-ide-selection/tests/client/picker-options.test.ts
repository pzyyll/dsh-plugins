// ABOUTME: Verify compact IDE labels preserve selection rules and full connection details.
// ABOUTME: Cover path shortening, ambiguous windows, localization, and unavailable IDEs.
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
  it("puts automatic selection first, manual IDEs next, and a single-line off action last", () => {
    const rows = pickerOptions(overview(), fallbackText);

    expect(rows.map((row) => row.id)).toEqual(["auto", "ide-one", "off"]);
    expect(rows[0]).toMatchObject({
      label: "Automatic",
      detail: "Workspace match · Visual Studio Code",
      title: "Connects to Visual Studio Code — f:\\workspace\\my\\dsh-plugins",
      active: true,
    });
    expect(rows[0]?.group).toBeUndefined();
    expect(rows[1]).toMatchObject({
      detail: "…\\my\\dsh-plugins",
      title: "f:\\workspace\\my\\dsh-plugins · 127.0.0.1:51234",
      group: { name: "ides", label: "Manual selection" },
    });
    expect(rows[2]?.detail).toBeUndefined();
    expect(rows[2]?.group).toBeUndefined();
    expect(rows[2]?.title).toBe("Stop reading IDE selections for this session");
  });

  it.each<IdeSelectionTarget>([
    { kind: "auto" },
    { kind: "manual", ideId: "ide-one" },
    { kind: "off" },
  ])("keeps exactly the current $kind choice selected", (selection) => {
    const rows = pickerOptions(overview([REACHABLE_IDE], selection), fallbackText);
    const expectedId = selection.kind === "manual" ? selection.ideId : selection.kind;

    expect(rows.filter((row) => row.active).map((row) => row.id)).toEqual([expectedId]);
  });

  it("shortens each workspace but keeps short paths and roots intact", () => {
    const workspaces = ["/home/julian/work/app", "/work/app", "/", "C:\\"];
    const rows = pickerOptions(
      overview([{ ...REACHABLE_IDE, workspaceFolders: workspaces }]),
      fallbackText,
    );

    expect(rows[1]?.detail).toBe("…/work/app, /work/app, /, C:\\");
    expect(rows[1]?.title).toContain(workspaces.join(", "));
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
    );

    expect(rows[1]?.detail).toBe("…\\my\\dsh-plugins · 127.0.0.1:51234");
    expect(rows[2]?.detail).toBe(`…\\my\\dsh-plugins · 127.0.0.1:${otherPort}`);
    expect(rows[3]?.detail).toBe("…\\my\\another-project");
    expect(rows[2]?.title).toContain("c:\\projects\\my\\dsh-plugins");
  });

  it("keeps nonmatching IDEs disabled and explains the mismatch", () => {
    const rows = pickerOptions(
      overview([{ ...REACHABLE_IDE, workspaceMatched: false }]),
      fallbackText,
    );

    expect(rows[0]?.detail).toBe("No workspace-matching IDE is reachable");
    expect(rows[1]).toMatchObject({
      disabled: true,
      detail: "…\\my\\dsh-plugins · Outside this session's workspace",
    });
    expect(rows[1]?.title).toContain("Outside this session's workspace");
    expect(rows[0]?.disabled).toBeUndefined();
    expect(rows[2]?.disabled).toBeUndefined();
  });

  it("keeps the automatic and off choices when no IDE is reachable", () => {
    const rows = pickerOptions({ selection: { kind: "auto" }, ides: [] }, fallbackText);

    expect(rows.map((row) => row.id)).toEqual(["auto", "off"]);
    expect(rows[0]?.detail).toBe("No workspace-matching IDE is reachable");
  });

  it("keeps unknown workspace text", () => {
    const rows = pickerOptions(
      overview([{ ...REACHABLE_IDE, workspaceFolders: [] }]),
      fallbackText,
    );

    expect(rows[1]?.detail).toBe("unknown workspace");
  });

  it("uses the supplied locale for the compact labels", () => {
    const rows = pickerOptions(overview(), (key, params) => {
      const template = zh[key as keyof typeof zh];
      return template.replace(/\{(\w+)\}/g, (_match, name: string) => String(params?.[name]));
    });

    expect(rows[0]?.label).toBe("自动选择");
    expect(rows[0]?.detail).toBe("按工作区匹配 · Visual Studio Code");
    expect(rows[1]?.group?.label).toBe("手动选择");
  });
});
