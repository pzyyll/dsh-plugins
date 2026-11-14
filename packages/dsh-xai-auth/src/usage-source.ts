// ABOUTME: Maps a SuperGrok meter onto the usageSources registration shape.
// ABOUTME: The shape is structural. This package does not import dsh-usages.

import type { GrokUsageView } from "./grok-usage.ts";

export interface ContributedWindow {
  readonly id: string;
  readonly label: string;
  readonly usedPercent: number;
  readonly remainingPercent: number;
  readonly resetsAt?: string;
}

export type ContributedReading =
  | { readonly status: "unavailable" }
  | { readonly status: "signed-out" }
  | { readonly status: "failed" }
  | {
      readonly status: "ready";
      readonly title: string;
      readonly windows: readonly ContributedWindow[];
    };

export interface ContributedSource {
  readonly id: string;
  readonly providers: readonly string[];
  read(refresh: boolean, signal: AbortSignal): Promise<ContributedReading>;
}

export interface UsageSourceHub {
  register(source: ContributedSource): () => void;
}

export interface UsageAttachment {
  readonly delegated: boolean;
  readonly release: (() => void) | undefined;
  readonly hub: UsageSourceHub | undefined;
}

/** One credit window. Period kind ids match the titles dsh-usages already translates. */
export function usageSourceReading(input: {
  readonly signedIn: boolean;
  readonly usage?: GrokUsageView;
  readonly error?: string;
}): ContributedReading {
  if (!input.signedIn) return { status: "signed-out" };
  const credits = input.usage?.credits;
  if (credits === undefined) {
    return input.error === undefined ? { status: "unavailable" } : { status: "failed" };
  }
  const used = clampPercent(credits.percent);
  const id = input.usage?.periodKind ?? "credits";
  const resetsAt = input.usage?.periodEnd;
  return {
    status: "ready",
    title: "SuperGrok",
    windows: [
      {
        id,
        label: id,
        usedPercent: used,
        remainingPercent: clampPercent(100 - used),
        ...(resetsAt === undefined ? {} : { resetsAt }),
      },
    ],
  };
}

/**
 * Register while the hub exists. A missing hub releases the previous registration
 * so the floating pill can come back. Repeating a live registration does not register twice.
 */
export function attachUsageSource(
  current: UsageAttachment,
  hub: UsageSourceHub | undefined,
  source: ContributedSource,
): UsageAttachment {
  if (hub === undefined || typeof hub.register !== "function") {
    current.release?.();
    return { delegated: false, release: undefined, hub: undefined };
  }
  if (current.delegated && current.release !== undefined && current.hub === hub) return current;
  current.release?.();
  try {
    const release = hub.register(source);
    if (typeof release !== "function")
      return { delegated: false, release: undefined, hub: undefined };
    return { delegated: true, release, hub };
  } catch {
    return { delegated: false, release: undefined, hub: undefined };
  }
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}
