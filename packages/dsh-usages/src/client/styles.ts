// ABOUTME: Sidebar and detail styles for the usage row.
// ABOUTME: Colors come from host theme tokens so light and dark stay consistent.

export const USAGE_STYLE_ID = "dsh-usages-style";

export const USAGE_CSS = `
[data-slot="sidebar.footer.action"] {
  display: flex !important;
  flex-direction: column;
  align-items: stretch;
  width: 100%;
  min-width: 0;
}
[data-sidebar-collapsed="true"] [data-slot="sidebar.footer.action"] {
  width: auto;
  align-items: center;
  gap: 12px;
}
[data-dsh-usages-root] {
  display: flex;
  min-width: 0;
}
[data-dsh-usages-root][data-wide="true"] {
  width: 100%;
}
[data-dsh-usages-trigger] {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-width: 0;
  min-height: 36px;
  margin: 0;
  padding: 4px 10px;
  border: 0;
  border-radius: 12px;
  background: transparent;
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: 13px;
  line-height: 18px;
  text-align: start;
  cursor: pointer;
}
[data-dsh-usages-trigger]:hover,
[data-dsh-usages-trigger][aria-expanded="true"] {
  background: color-mix(in srgb, var(--dsw-alias-label-primary) 8%, transparent);
}
[data-dsh-usages-root][data-wide="false"] [data-dsh-usages-trigger] {
  justify-content: center;
  width: auto;
  min-width: 36px;
  height: 36px;
  padding: 0 6px;
  border-radius: 999px;
}
[data-dsh-usages-mark] {
  flex: none;
  display: block;
}
/* The balance capsule takes the leading slot the gauge mark used to hold. */
[data-dsh-usages-money] {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
}
[data-dsh-usages-facts] {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}
[data-dsh-usages-fact] {
  display: flex;
  align-items: baseline;
  gap: 6px;
  min-width: 0;
}
/* The name and the ring share one centre line; baseline alignment would push the
   text above a ring that is taller than its line box. */
[data-dsh-usages-fact][data-ring="true"],
[data-dsh-usages-fact][data-pill="true"] {
  align-items: center;
}
[data-dsh-usages-pill] {
  display: inline-flex;
  align-items: baseline;
  gap: 1px;
  max-width: 100%;
  padding: 2px 10px;
  border-radius: 999px;
  background: var(--dsw-alias-state-success-tertiary);
  color: var(--dsw-alias-state-success-secondary);
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
[data-dsh-usages-ring] {
  flex: none;
  display: block;
  align-self: center;
  overflow: visible;
}
[data-dsh-usages-ring] [data-dsh-usages-segment] {
  transform-box: view-box;
  transform-origin: 18px 18px;
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
  stroke-linecap: butt;
}
[data-dsh-usages-ring] [data-role="fill"] {
  fill: none;
  /* Softer than the ink, so the remainder reads as a grey arc instead of solid black. */
  stroke: color-mix(in srgb, var(--dsw-alias-label-primary) 62%, transparent);
  stroke-linecap: round;
  transition:
    stroke var(--ds-transition-duration-fast) var(--ds-ease-in-out),
    opacity var(--ds-transition-duration-fast) var(--ds-ease-in-out);
}
/* A single window is one closed ring. Butt caps let the remainder meet the other side. */
[data-dsh-usages-ring][data-closed="true"] [data-role="fill"] {
  stroke-linecap: butt;
}
/* While one segment is focused, the others fall back to their plain 100% track. */
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
[data-dsh-usages-name] {
  flex: none;
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
}
[data-dsh-usages-value] {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
[data-dsh-usages-compact] {
  font-size: 10px;
  font-variant-numeric: tabular-nums;
}
[data-dsh-usages-panel] {
  position: fixed;
  z-index: 80;
  box-sizing: border-box;
  width: min(360px, calc(100vw - 16px));
  max-height: min(480px, calc(100vh - 16px));
  overflow: auto;
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
  align-items: center;
  gap: 8px;
  margin: 0 -16px 12px;
  padding: 0 16px 12px;
  border-bottom: 1px solid var(--dsw-alias-border-l1);
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
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  margin: 4px -16px 0;
  padding: 8px 12px 8px 16px;
  border-top: 1px solid var(--dsw-alias-border-l1);
  background: color-mix(in srgb, var(--dsw-alias-label-primary) 4%, transparent);
}
[data-dsh-usages-updated] {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  color: var(--dsw-alias-label-tertiary);
  font-size: 11px;
  line-height: 16px;
}
[data-dsh-usages-dot] {
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: var(--dsw-alias-state-success-primary);
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
  [data-dsh-usages-refresh][aria-busy="true"] svg {
    animation: none;
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
