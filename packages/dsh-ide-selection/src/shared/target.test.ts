// ABOUTME: Verify workspace eligibility survives the host-to-browser target payload.
// ABOUTME: Reject missing eligibility flags and automatic targets outside the workspace.
import { describe, expect, it } from "vitest";
import { parseTargetOverview, toTargetRow, type IdeTargetRow } from "./target.js";

const IDE_PORT = 51_234;
const MATCHED_IDE: IdeTargetRow = {
  id: "workspace-ide",
  name: "Visual Studio Code",
  host: "127.0.0.1",
  port: IDE_PORT,
  workspaceFolders: ["/work/app/src"],
  workspaceMatched: true,
};
const OUTSIDE_IDE: IdeTargetRow = {
  ...MATCHED_IDE,
  id: "other-ide",
  workspaceFolders: ["/other/project"],
  workspaceMatched: false,
};

function overview(ides: readonly unknown[], automaticId = MATCHED_IDE.id) {
  return { selection: { kind: "auto" }, ides, automaticId };
}

describe("IDE target workspace eligibility", () => {
  it("keeps matching and non-matching IDEs in the parsed overview", () => {
    const payload = overview([MATCHED_IDE, OUTSIDE_IDE]);
    expect(parseTargetOverview(payload)).toEqual(payload);
  });

  it.each([undefined, null, "true"])(
    "rejects an invalid workspace flag: %j",
    (workspaceMatched) => {
      expect(parseTargetOverview(overview([{ ...MATCHED_IDE, workspaceMatched }]))).toBeUndefined();
    },
  );

  it("rejects an automatic target that is visible but outside the workspace", () => {
    expect(
      parseTargetOverview(overview([MATCHED_IDE, OUTSIDE_IDE], OUTSIDE_IDE.id)),
    ).toBeUndefined();
  });

  it("projects the host's workspace flag without changing its meaning", () => {
    expect(
      toTargetRow({
        ...OUTSIDE_IDE,
        host: "127.0.0.1",
        workspaceFolders: [...OUTSIDE_IDE.workspaceFolders],
      }),
    ).toEqual(OUTSIDE_IDE);
  });
});
