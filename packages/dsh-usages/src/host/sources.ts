// ABOUTME: Registry of usage channels contributed by other plugins.
// ABOUTME: Replacing an id drops the previous registration; disposing the old one is a no-op.

import type { UsageSource, UsageSourceReading, UsageSources } from "../shared/model.js";

export class UsageSourceRegistry implements UsageSources {
  private readonly sources = new Map<string, UsageSource>();

  register(source: UsageSource): () => void {
    if (!usableSource(source)) return () => {};
    this.sources.set(source.id, source);
    let current = true;
    return () => {
      if (!current) return;
      current = false;
      if (this.sources.get(source.id) === source) this.sources.delete(source.id);
    };
  }

  list(): readonly UsageSource[] {
    return [...this.sources.values()];
  }
}

function usableSource(source: UsageSource): boolean {
  return (
    typeof source?.id === "string" &&
    source.id !== "" &&
    Array.isArray(source.providers) &&
    typeof source.read === "function"
  );
}

/** Keep a contributor payload inside the fields the sidebar renders. Extra fields are dropped. */
export function normalizeSourceReading(value: unknown): UsageSourceReading {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return { status: "failed" };
  const record = value as Record<string, unknown>;
  if (
    record.status === "unavailable" ||
    record.status === "signed-out" ||
    record.status === "failed"
  ) {
    return { status: record.status };
  }
  if (record.status !== "ready" || typeof record.title !== "string" || record.title.trim() === "") {
    return { status: "failed" };
  }
  if (!Array.isArray(record.windows)) return { status: "failed" };
  const windows = record.windows.flatMap((item) => {
    if (typeof item !== "object" || item === null || Array.isArray(item)) return [];
    const window = item as Record<string, unknown>;
    if (typeof window.id !== "string" || window.id === "") return [];
    if (typeof window.label !== "string" || window.label === "") return [];
    const used = percent(window.usedPercent);
    const remaining = percent(window.remainingPercent);
    if (used === undefined || remaining === undefined) return [];
    const resetsAt =
      typeof window.resetsAt === "string" && window.resetsAt !== "" ? window.resetsAt : undefined;
    return [
      {
        id: window.id,
        label: window.label,
        usedPercent: used,
        remainingPercent: remaining,
        ...(resetsAt === undefined ? {} : { resetsAt }),
      },
    ];
  });
  if (windows.length === 0) return { status: "failed" };
  return { status: "ready", title: record.title.trim(), windows };
}

function percent(value: unknown): number | undefined {
  const number =
    typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  if (!Number.isFinite(number)) return undefined;
  return Math.min(100, Math.max(0, number));
}
