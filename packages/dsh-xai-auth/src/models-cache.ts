// ABOUTME: Persists the SuperGrok model catalog under the Harness cache.
// ABOUTME: A missing cache can warm-start from Grok Build's read-only models_cache.json.

import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import {
  isAlwaysOnReasoningModel,
  isRecord,
  parseRemoteModelEntry,
  type CatalogModel,
} from "./catalog.ts";
import { MODELS_CACHE_TTL_MS } from "./constants.ts";
import { grokBuildModelsCachePath } from "./grok-paths.ts";
import { modelsCachePath } from "./paths.ts";

export interface ModelsCacheFile {
  fetched_at: string;
  auth_method?: string;
  origin?: string;
  etag?: string;
  models: Record<string, unknown>;
}

export interface LoadModelsCacheResult {
  models: CatalogModel[];
  etag?: string;
  fresh: boolean;
  origin?: string;
  source: "dsh" | "grok-build";
}

function parseFetchedAtMs(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : undefined;
}

export function isModelsCacheFresh(
  cache: Pick<ModelsCacheFile, "fetched_at">,
  ttlMs: number = MODELS_CACHE_TTL_MS,
  nowMs: number = Date.now(),
): boolean {
  const fetched = parseFetchedAtMs(cache.fetched_at);
  if (fetched === undefined) return false;
  const age = nowMs - fetched;
  return age >= 0 && age < ttlMs;
}

function readJsonFile(path: string): unknown | undefined {
  try {
    const raw = readFileSync(path, "utf8").trim();
    if (!raw) return undefined;
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
}

function atomicWriteJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp.${process.pid}.${Date.now()}`;
  writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  renameSync(tmp, path);
}

export function catalogFromCacheModelsMap(models: unknown): CatalogModel[] {
  if (!isRecord(models)) return [];
  const out: CatalogModel[] = [];
  const seen = new Set<string>();
  for (const [key, value] of Object.entries(models)) {
    const entry = isRecord(value) && value.info !== undefined ? value.info : value;
    const parsed = parseRemoteModelEntry(entry);
    if (parsed === undefined || seen.has(parsed.id || key)) continue;
    const id = parsed.id || key;
    seen.add(id);
    out.push(id === parsed.id ? parsed : { ...parsed, id });
  }
  return out;
}

function parseModelsCacheFile(value: unknown): ModelsCacheFile | undefined {
  if (!isRecord(value) || !isRecord(value.models)) return undefined;
  return {
    fetched_at: typeof value.fetched_at === "string" ? value.fetched_at : new Date(0).toISOString(),
    ...(typeof value.auth_method === "string" ? { auth_method: value.auth_method } : {}),
    ...(typeof value.origin === "string" ? { origin: value.origin } : {}),
    ...(typeof value.etag === "string" ? { etag: value.etag } : {}),
    models: value.models,
  };
}

function loadCacheAt(
  path: string,
  source: LoadModelsCacheResult["source"],
  expectedOrigin?: string,
): LoadModelsCacheResult | undefined {
  const parsed = parseModelsCacheFile(readJsonFile(path));
  if (parsed === undefined) return undefined;
  if (expectedOrigin && parsed.origin && parsed.origin !== expectedOrigin) return undefined;
  const models = catalogFromCacheModelsMap(parsed.models);
  if (models.length === 0) return undefined;
  return {
    models,
    ...(parsed.etag === undefined ? {} : { etag: parsed.etag }),
    fresh: isModelsCacheFresh(parsed),
    ...(parsed.origin === undefined ? {} : { origin: parsed.origin }),
    source,
  };
}

export function loadModelsCatalog(expectedOrigin?: string): LoadModelsCacheResult | undefined {
  return (
    loadCacheAt(modelsCachePath(), "dsh", expectedOrigin) ??
    loadCacheAt(grokBuildModelsCachePath(), "grok-build", expectedOrigin)
  );
}

export function saveModelsCatalog(
  models: CatalogModel[],
  meta: { origin: string; etag?: string; fetchedAt?: Date },
): void {
  if (models.length === 0) return;
  const map: Record<string, unknown> = {};
  for (const model of models) {
    map[model.id] = {
      info: {
        id: model.id,
        model: model.id,
        name: model.name,
        context_window: model.contextWindow,
        max_completion_tokens: model.maxTokens,
        supports_reasoning_effort: model.reasoning && !isAlwaysOnReasoningModel(model.id),
        hidden: false,
      },
    };
  }
  const cache: ModelsCacheFile = {
    fetched_at: (meta.fetchedAt ?? new Date()).toISOString(),
    auth_method: "session",
    origin: meta.origin,
    ...(meta.etag === undefined ? {} : { etag: meta.etag }),
    models: map,
  };
  atomicWriteJson(modelsCachePath(), cache);
}
