// ABOUTME: Check that the IDE picker stays anchored and inside small or scrolled viewports.
// ABOUTME: Cover top-edge flipping and viewport clamping independently of browser layout.
import { describe, expect, it } from "vitest";
import {
  PICKER_GAP_PX,
  PICKER_MARGIN_PX,
  pickerPosition,
} from "../../src/client/picker-position.js";

const VIEWPORT = { width: 800, height: 600 };
const PANEL = { width: 320, height: 240 };
const ANCHOR = { top: 500, bottom: 520, right: 700 };

describe("IDE picker position", () => {
  it("opens above and right-aligned with the status button", () => {
    expect(pickerPosition(ANCHOR, PANEL, VIEWPORT)).toEqual({
      left: ANCHOR.right - PANEL.width,
      top: ANCHOR.top - PANEL.height - PICKER_GAP_PX,
    });
  });

  it("flips below a trigger near the top edge", () => {
    const anchor = { top: 20, bottom: 40, right: ANCHOR.right };
    expect(pickerPosition(anchor, PANEL, VIEWPORT).top).toBe(anchor.bottom + PICKER_GAP_PX);
  });

  it("clamps either horizontal edge after scrolling or resizing", () => {
    expect(pickerPosition({ ...ANCHOR, right: 100 }, PANEL, VIEWPORT).left).toBe(PICKER_MARGIN_PX);
    expect(pickerPosition({ ...ANCHOR, right: 900 }, PANEL, VIEWPORT).left).toBe(
      VIEWPORT.width - PANEL.width - PICKER_MARGIN_PX,
    );
  });

  it("keeps the panel visible when neither side has enough room", () => {
    const panel = { width: 320, height: 560 };
    const position = pickerPosition({ top: 300, bottom: 320, right: 700 }, panel, VIEWPORT);
    expect(position.top).toBe(PICKER_MARGIN_PX);
    expect(position.top + panel.height).toBeLessThanOrEqual(VIEWPORT.height - PICKER_MARGIN_PX);
  });
});
