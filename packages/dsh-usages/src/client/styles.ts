// ABOUTME: Floating capsule and detail styles for usage.
// ABOUTME: Colors come from host theme tokens so light and dark stay consistent.

export const USAGE_STYLE_ID = "dsh-usages-style";

export const USAGE_CSS = `
[data-dsh-usages-float] {
  position: fixed;
  z-index: 40;
  display: flex;
  width: max-content;
  height: 32px;
  anchor-name: var(--dsh-usages-anchor);
}
[data-dsh-usages-float] [data-dsh-usages-trigger] {
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  width: 100%;
  height: 100%;
  margin: 0;
  padding: 0 12px;
  border: 0.8px solid color-mix(in srgb, var(--dsw-static-blue-450) 24%, transparent);
  border-radius: 12.8px;
  background: var(--dsw-specific-menu);
  color: var(--dsw-alias-label-primary);
  font: inherit;
  line-height: 18px;
  cursor: grab;
  touch-action: none;
  user-select: none;
  -webkit-app-region: no-drag;
  box-shadow: var(--dsw-elevation-prominent);
  transition: box-shadow 160ms ease;
}
[data-dsh-usages-float][data-edge="left"]:not([data-dragging="true"]) [data-dsh-usages-trigger] {
  border-radius: 0 12.8px 12.8px 0;
  border-left-color: transparent;
}
[data-dsh-usages-float][data-edge="right"]:not([data-dragging="true"]) [data-dsh-usages-trigger] {
  border-radius: 12.8px 0 0 12.8px;
  border-right-color: transparent;
}
[data-dsh-usages-float][data-dragging="true"] [data-dsh-usages-trigger] {
  cursor: grabbing;
}
[data-dsh-usages-float] [data-dsh-usages-trigger][aria-expanded="true"],
[data-dsh-usages-float] button[data-dsh-usages-trigger]:hover {
  box-shadow:
    0 0 9.6px color-mix(in srgb, var(--dsw-static-blue-450) 28%, transparent),
    0 0 19.2px color-mix(in srgb, var(--dsw-static-blue-300) 16%, transparent),
    var(--dsw-elevation-prominent);
}
[data-dsh-usages-float] button[data-dsh-usages-trigger]:focus-visible {
  outline: var(--dsw-focus-ring-width) solid
    var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));
  outline-offset: -2px;
}
[data-dsh-usages-float] [role="status"] {
  cursor: default;
}
/* 32px ring, 4px of padding before the border. Hover growth stays inside that gap. */
[data-dsh-usages-float][data-face="ring"] {
  width: max-content;
  height: max-content;
}
[data-dsh-usages-float][data-face="ring"] [data-dsh-usages-trigger] {
  width: auto;
  height: auto;
  padding: 4px;
}
[data-dsh-usages-money] {
  flex: none;
  display: inline-flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
  max-width: 100%;
  color: var(--dsw-alias-label-primary);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
/* No nested capsule: the floating shell is already the container. */
[data-dsh-usages-pill] {
  display: inline-flex;
  align-items: baseline;
  gap: 1px;
  max-width: 100%;
  color: inherit;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
[data-dsh-usages-pill-symbol] {
  font-size: 10px;
  line-height: 14px;
  color: inherit;
}
[data-dsh-usages-pill-amount] {
  font-size: 13px;
  line-height: 18px;
  font-weight: 650;
  color: inherit;
}
[data-dsh-usages-status] {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
[data-dsh-usages-mark] {
  flex: none;
  display: block;
}
[data-dsh-usages-value] {
  min-width: 0;
  overflow: hidden;
  font-size: 13px;
  line-height: 18px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
[data-dsh-usages-ring] {
  flex: none;
  display: block;
  width: 32px;
  height: 32px;
  max-width: 32px;
  max-height: 32px;
  overflow: visible;
}
[data-dsh-usages-ring] [data-dsh-usages-segment] {
  transform-box: fill-box;
  transform-origin: center;
  transition: transform var(--ds-transition-duration-fast) var(--ds-ease-in-out);
  pointer-events: none;
}
@media (hover: hover) {
  [data-dsh-usages-ring] [data-dsh-usages-segment][data-hover="true"] {
    transform: scale(1.16);
  }
}
@media (prefers-reduced-motion: reduce) {
  [data-dsh-usages-ring] [data-dsh-usages-segment] {
    transition: none;
  }
}
[data-dsh-usages-ring] [data-role="hub"] {
  fill: color-mix(in srgb, var(--dsw-alias-label-primary) 22%, transparent);
}
[data-dsh-usages-ring] [data-role="track"] {
  fill: none;
  stroke: color-mix(in srgb, var(--dsw-alias-label-primary) 32%, transparent);
  stroke-linecap: round;
}
[data-dsh-usages-ring] [data-role="fill"] {
  fill: none;
  stroke: color-mix(in srgb, var(--dsw-alias-label-primary) 62%, transparent);
  stroke-linecap: round;
  transition:
    stroke var(--ds-transition-duration-fast) var(--ds-ease-in-out),
    opacity var(--ds-transition-duration-fast) var(--ds-ease-in-out);
}
[data-dsh-usages-ring][data-closed="true"] [data-role="fill"] {
  stroke-linecap: butt;
}
[data-dsh-usages-ring][data-hovering="true"]
  [data-dsh-usages-segment][data-hover="false"]
  [data-role="fill"] {
  opacity: 0;
}
[data-dsh-usages-ring] [data-role="fill"][data-level="low"] {
  stroke: var(--dsw-alias-state-warn-primary);
}
[data-dsh-usages-ring] [data-role="fill"][data-level="empty"] {
  stroke: var(--dsw-alias-state-error-primary);
}
[data-dsh-usages-ring] [data-role="hit"] {
  fill: none;
  stroke: transparent;
  stroke-width: 10;
}
[data-dsh-usages-tip] {
  position: fixed;
  z-index: 100;
  transform: translate(-50%, -100%);
  padding: 3px 7px;
  border-radius: var(--dsw-radius-sm);
  background: var(--dsw-alias-tooltip-bg);
  color: var(--dsw-alias-tooltip-label);
  font-size: 12px;
  line-height: 18px;
  white-space: nowrap;
  pointer-events: none;
  box-shadow: 0 6px 16px color-mix(in srgb, var(--dsw-alias-label-primary) 18%, transparent);
}
[data-dsh-usages-spinner] {
  flex: none;
  box-sizing: border-box;
  width: 14px;
  height: 14px;
  border: 2px solid color-mix(in srgb, var(--dsw-alias-label-primary) 22%, transparent);
  border-top-color: color-mix(in srgb, var(--dsw-alias-label-primary) 72%, transparent);
  border-radius: 50%;
  animation: dsh-usages-spin 0.8s linear infinite;
}
[data-dsh-usages-panel] {
  position: fixed;
  z-index: 80;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  width: min(360px, calc(100vw - 16px));
  max-height: min(480px, calc(100vh - 16px));
  /* The panel itself never scrolls; the body between the head and the foot does. */
  overflow: hidden;
  padding: 16px 16px 0;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: var(--dsw-radius-lg);
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-primary);
  box-shadow:
    0 1px 2px color-mix(in srgb, var(--dsw-alias-label-primary) 10%, transparent),
    0 12px 32px color-mix(in srgb, var(--dsw-alias-label-primary) 18%, transparent);
  pointer-events: auto;
}
[data-dsh-usages-panel] h2 {
  margin: 0;
  font-size: 14px;
  line-height: 20px;
  font-weight: 600;
}
[data-dsh-usages-head] {
  display: flex;
  flex: none;
  align-items: center;
  gap: 8px;
  margin: 0 -16px;
  padding: 0 16px 12px;
  border-bottom: 1px solid var(--dsw-alias-border-l1);
}
[data-dsh-usages-body] {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  margin: 0 -16px;
  padding: 12px 16px 4px;
}
[data-dsh-usages-markbar] {
  width: 3px;
  height: 16px;
  border-radius: 999px;
  background: var(--dsw-alias-brand-primary);
}
[data-dsh-usages-section] {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px 0;
  border-top: 1px solid var(--dsw-alias-border-l1);
}
[data-dsh-usages-section]:first-of-type {
  border-top: 0;
  padding-top: 0;
}
[data-dsh-usages-section-head] {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
[data-dsh-usages-head] [data-dsh-usages-actions],
[data-dsh-usages-section-head] [data-dsh-usages-actions] {
  flex: none;
}
[data-dsh-usages-section] h3 {
  margin: 0;
  font-size: 13px;
  line-height: 18px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary);
}
[data-dsh-usages-balances] {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0;
  padding: 10px 12px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: var(--dsw-radius-md);
  background: color-mix(in srgb, var(--dsw-alias-label-primary) 4%, transparent);
}
[data-dsh-usages-balance] {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
[data-dsh-usages-balance] + [data-dsh-usages-balance] {
  padding-left: 12px;
  border-left: 1px solid var(--dsw-alias-border-l2);
}
[data-dsh-usages-figure] {
  font-size: 15px;
  line-height: 22px;
  font-weight: 650;
  font-variant-numeric: tabular-nums;
}
[data-dsh-usages-quota] {
  font-size: 12px;
  line-height: 16px;
  font-weight: 600;
}
[data-dsh-usages-remain] {
  display: inline-flex;
  align-items: baseline;
  gap: 6px;
  color: var(--dsw-alias-label-tertiary);
  font-size: 11px;
  line-height: 16px;
}
[data-dsh-usages-remain] [data-dsh-usages-figure] {
  color: var(--dsw-alias-label-primary);
  font-size: 12px;
  line-height: 16px;
  font-weight: 650;
}
[data-dsh-usages-meta] {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  color: var(--dsw-alias-label-tertiary);
  font-size: 11px;
  line-height: 16px;
}
[data-dsh-usages-reset] {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
}
[data-dsh-usages-foot] {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  margin: 0 -16px;
  padding: 8px 12px 8px 16px;
  border-top: 1px solid var(--dsw-alias-border-l1);
  background: color-mix(in srgb, var(--dsw-alias-label-primary) 4%, transparent);
}
[data-dsh-usages-row] {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin: 0;
}
[data-dsh-usages-label] {
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
}
[data-dsh-usages-amount] {
  margin: 0;
  font-size: 13px;
  text-align: end;
  font-variant-numeric: tabular-nums;
}
[data-dsh-usages-track] {
  display: block;
  height: 4px;
  margin-top: 0;
  border-radius: 999px;
  background: color-mix(in srgb, var(--dsw-alias-label-primary) 12%, transparent);
  overflow: hidden;
}
[data-dsh-usages-fill] {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--dsw-alias-brand-primary);
}
[data-dsh-usages-fill][data-low="true"] {
  background: var(--dsw-alias-state-warn-primary);
}
[data-dsh-usages-fill][data-empty="true"] {
  background: var(--dsw-alias-state-error-primary);
}
[data-dsh-usages-note] {
  margin: 0;
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
  line-height: 16px;
}
[data-dsh-usages-error] {
  margin: 8px 0 0;
  color: var(--dsw-alias-state-error-primary);
  font-size: 12px;
  line-height: 16px;
}
[data-dsh-usages-actions] {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}
/* Matches the host Button's outline/small variant: hairline inset ring, 28px
   height, hover and pressed fills from the interactive tokens. */
[data-dsh-usages-action] {
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  height: 28px;
  padding: 0 10px;
  border: 0.5px solid transparent;
  border-radius: var(--dsw-radius-sm);
  box-shadow: inset 0 0 0 var(--dsh-hairline-width, 0.5px) var(--dsw-alias-border-l3);
  background: transparent;
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: 12px;
  line-height: 18px;
  text-decoration: none;
  white-space: nowrap;
  cursor: pointer;
  transition: background-color var(--ds-transition-duration-fast) var(--ds-ease-in-out);
}
@media (hover: hover) {
  [data-dsh-usages-action]:hover:not(:disabled) {
    background: var(--dsw-alias-interactive-bg-hover);
  }
}
[data-dsh-usages-action]:active:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-active);
}
[data-dsh-usages-action][data-primary="true"] {
  border-color: transparent;
  box-shadow: none;
  background: var(--dsw-alias-button-primary-fill);
  color: var(--dsw-alias-label-primary-foreground);
}
@media (hover: hover) {
  [data-dsh-usages-action][data-primary="true"]:hover:not(:disabled) {
    background: var(--dsw-alias-button-primary-hover);
  }
}
[data-dsh-usages-action][data-primary="true"]:active:not(:disabled) {
  background: var(--dsw-alias-button-primary-hover);
}
[data-dsh-usages-action]:disabled {
  cursor: not-allowed;
  opacity: 0.4;
}
[data-dsh-usages-refresh][aria-busy="true"] svg {
  animation: dsh-usages-spin 0.8s linear infinite;
}
@keyframes dsh-usages-spin {
  to {
    transform: rotate(360deg);
  }
}
@media (prefers-reduced-motion: reduce) {
  [data-dsh-usages-float] [data-dsh-usages-trigger],
  [data-dsh-usages-refresh][aria-busy="true"] svg,
  [data-dsh-usages-spinner] {
    animation: none;
    transition: none;
  }
}
[data-dsh-usages-windows] {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
[data-dsh-usages-window] {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
`.trim();
