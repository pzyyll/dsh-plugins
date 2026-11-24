// ABOUTME: Verify the route gate reads the owner Peer that admission fixed.
// ABOUTME: Keep a viewer or an absent Peer out of the IDE selection routes.
import { describe, expect, it } from "vitest";
import { isOwnerPeer } from "../../src/dsh/owner-gate.js";

describe("owner gate", () => {
  it("admits only the owner principal", () => {
    expect(isOwnerPeer({ principal: { kind: "owner" } })).toBe(true);
    expect(isOwnerPeer({ principal: { kind: "viewer" } })).toBe(false);
    expect(isOwnerPeer(undefined)).toBe(false);
  });
});
