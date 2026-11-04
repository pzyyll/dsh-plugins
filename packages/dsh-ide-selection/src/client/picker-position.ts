// ABOUTME: Place the IDE picker above its status button and keep it inside the viewport.
// ABOUTME: Use the same gap and viewport margin as the composer context panel.

export const PICKER_GAP_PX = 8;
export const PICKER_MARGIN_PX = 12;

interface AnchorBounds {
  top: number;
  bottom: number;
  right: number;
}

interface Size {
  width: number;
  height: number;
}

/** Prefer above the trigger, flip below when needed, and clamp to the viewport. */
export function pickerPosition(
  anchor: AnchorBounds,
  panel: Size,
  viewport: Size,
): { left: number; top: number } {
  const above = anchor.top - panel.height - PICKER_GAP_PX;
  const below = anchor.bottom + PICKER_GAP_PX;
  const top =
    above < PICKER_MARGIN_PX && below + panel.height <= viewport.height - PICKER_MARGIN_PX
      ? below
      : above;
  return {
    left: Math.max(
      PICKER_MARGIN_PX,
      Math.min(anchor.right - panel.width, viewport.width - panel.width - PICKER_MARGIN_PX),
    ),
    top: Math.max(
      PICKER_MARGIN_PX,
      Math.min(top, viewport.height - panel.height - PICKER_MARGIN_PX),
    ),
  };
}
