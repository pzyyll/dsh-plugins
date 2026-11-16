// ABOUTME: Share the latest usage snapshot between the floating capsule and its detail.
// ABOUTME: Both seats subscribe, so a refresh updates the open panel without another registration.

import type { Anchor, UsageSnapshot } from "../shared/model.js";

export interface UsageState {
  readonly open: boolean;
  readonly anchor: Anchor | null;
  readonly snapshot: UsageSnapshot | null;
  readonly pending: boolean;
  readonly error: string | null;
  /** Channels that answered at least once. The rest are still being queried. */
  readonly answered: ReadonlySet<string>;
}

const listeners = new Set<() => void>();

let state: UsageState = {
  open: false,
  anchor: null,
  snapshot: null,
  pending: true,
  error: null,
  answered: new Set<string>(),
};

function commit(next: UsageState): void {
  if (
    next.open === state.open &&
    next.anchor === state.anchor &&
    next.snapshot === state.snapshot &&
    next.pending === state.pending &&
    next.error === state.error &&
    next.answered === state.answered
  )
    return;
  state = next;
  for (const listener of listeners) listener();
}

/** Keep the identity stable when every requested channel has already answered. */
function answeredWith(
  current: ReadonlySet<string>,
  channels: readonly string[],
): ReadonlySet<string> {
  const missing = channels.filter((channel) => !current.has(channel));
  return missing.length === 0 ? current : new Set([...current, ...missing]);
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

/**
 * `channels` are the ones this response actually queried; an unrequested channel keeps
 * whatever the host had cached, so it must not count as answered.
 */
export function setUsageSnapshot(snapshot: UsageSnapshot, channels: readonly string[] = []): void {
  commit({
    ...state,
    snapshot,
    answered: answeredWith(state.answered, channels),
    error: null,
    pending: false,
  });
}

/** A failed request settles the channel too, so its row cannot spin forever. */
export function setUsageError(error: string, channels: readonly string[] = []): void {
  commit({
    ...state,
    error,
    answered: answeredWith(state.answered, channels),
    pending: false,
  });
}

export function setUsageOpen(open: boolean, anchor: Anchor | null): void {
  commit({ ...state, open, anchor });
}
