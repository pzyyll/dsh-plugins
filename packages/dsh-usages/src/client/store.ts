// ABOUTME: Share the latest usage snapshot between the sidebar row and its detail.
// ABOUTME: Both seats subscribe, so a refresh updates the open panel without another registration.

import type { Anchor, UsageSnapshot } from "../shared/model.js";

export interface UsageState {
  readonly open: boolean;
  readonly anchor: Anchor | null;
  readonly snapshot: UsageSnapshot | null;
  readonly pending: boolean;
  readonly error: string | null;
}

const listeners = new Set<() => void>();

let state: UsageState = {
  open: false,
  anchor: null,
  snapshot: null,
  pending: true,
  error: null,
};

function commit(next: UsageState): void {
  if (
    next.open === state.open &&
    next.anchor === state.anchor &&
    next.snapshot === state.snapshot &&
    next.pending === state.pending &&
    next.error === state.error
  )
    return;
  state = next;
  for (const listener of listeners) listener();
}

export function usageState(): UsageState {
  return state;
}

export function subscribeUsage(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function setUsagePending(pending: boolean): void {
  commit({ ...state, pending });
}

export function setUsageSnapshot(snapshot: UsageSnapshot): void {
  commit({ ...state, snapshot, error: null, pending: false });
}

export function setUsageError(error: string): void {
  commit({ ...state, error, pending: false });
}

export function setUsageOpen(open: boolean, anchor: Anchor | null): void {
  commit({ ...state, open, anchor });
}
