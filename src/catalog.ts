// ABOUTME: Parses cli-chat-proxy model catalogs and aligns Responses bodies to grok-build.
// ABOUTME: Effort menus and list prices stay explicit; unknown model ids cost zero.

/** Canonical wire values for Responses reasoning.effort. */
export type ReasoningEffortWire = 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'

/** Offered when the server marks effort selectable but lists no menu. */
export const LEGACY_REASONING_EFFORTS: readonly ReasoningEffortWire[] = [
  'low',
  'medium',
  'high',
  'xhigh',
]

export type ThinkingLevelMap = {
  off: string | null
  minimal: string | null
  low: string | null
  medium: string | null
  high: string | null
  xhigh: string | null
}

export interface ModelCost {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
}

export interface CatalogModel {
  id: string
  name: string
  reasoning: boolean
  reasoningEfforts?: ReasoningEffortWire[]
  input: Array<'text' | 'image'>
  cost: ModelCost
  contextWindow: number
  maxTokens: number
}

/** Default context window when a remote entry omits one. */
export const DEFAULT_CONTEXT_WINDOW = 256_000
const DEFAULT_MAX_OUTPUT_TOKENS = 128_000

export const ZERO_COST: ModelCost = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }

/** USD per 1M tokens. Short-context list prices only; subscription billing differs. */
const OFFICIAL_XAI_PRICING: Record<string, ModelCost> = {
  'grok-build-0.1': { input: 1, output: 2, cacheRead: 0.2, cacheWrite: 0 },
  'grok-4.5': { input: 2, output: 6, cacheRead: 0.5, cacheWrite: 0 },
  'grok-4.3': { input: 1.25, output: 2.5, cacheRead: 0.2, cacheWrite: 0 },
  'grok-4.20-multi-agent-0309': { input: 1.25, output: 2.5, cacheRead: 0.2, cacheWrite: 0 },
  'grok-4.20-0309-reasoning': { input: 1.25, output: 2.5, cacheRead: 0.2, cacheWrite: 0 },
  'grok-4.20-0309-non-reasoning': { input: 1.25, output: 2.5, cacheRead: 0.2, cacheWrite: 0 },
  'grok-composer-2.5-fast': { input: 0.5, output: 2.5, cacheRead: 0.2, cacheWrite: 0 },
}

const PRICING_ALIASES: Record<string, string> = {
  'grok-build': 'grok-build-0.1',
  'grok-build-latest': 'grok-build-0.1',
  'grok-4.5-latest': 'grok-4.5',
  'grok-4.3-latest': 'grok-4.3',
  'grok-compose-2.5-fast': 'grok-composer-2.5-fast',
  'composer-2.5-fast': 'grok-composer-2.5-fast',
}

export function resolveXaiModelCost(modelId: string): ModelCost {
  const rates = OFFICIAL_XAI_PRICING[PRICING_ALIASES[modelId] ?? modelId]
  return rates ? { ...rates } : { ...ZERO_COST }
}

export const FALLBACK_CATALOG: readonly CatalogModel[] = [
  {
    id: 'grok-4.5',
    name: 'Grok 4.5',
    reasoning: true,
    input: ['text', 'image'],
    cost: resolveXaiModelCost('grok-4.5'),
    contextWindow: 500_000,
    maxTokens: DEFAULT_MAX_OUTPUT_TOKENS,
  },
  {
    id: 'grok-build',
    name: 'Grok Build',
    reasoning: false,
    input: ['text', 'image'],
    cost: resolveXaiModelCost('grok-build'),
    contextWindow: 500_000,
    maxTokens: DEFAULT_MAX_OUTPUT_TOKENS,
  },
]

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function firstString(obj: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = obj[key]
    if (typeof value === 'string' && value.length > 0) return value
  }
  return undefined
}

function firstNumber(obj: Record<string, unknown>, ...keys: string[]): number | undefined {
  for (const key of keys) {
    const value = obj[key]
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value
    if (typeof value === 'string' && value.trim() !== '') {
      const parsed = Number(value)
      if (Number.isFinite(parsed) && parsed > 0) return parsed
    }
  }
  return undefined
}

function firstBool(obj: Record<string, unknown>, ...keys: string[]): boolean | undefined {
  for (const key of keys) {
    const value = obj[key]
    if (typeof value === 'boolean') return value
  }
  return undefined
}

export function parseReasoningEffortToken(token: string): ReasoningEffortWire | undefined {
  switch (token.toLowerCase()) {
    case 'none':
      return 'none'
    case 'minimal':
      return 'minimal'
    case 'low':
      return 'low'
    case 'medium':
      return 'medium'
    case 'high':
      return 'high'
    case 'xhigh':
    case 'max':
      return 'xhigh'
    default:
      return undefined
  }
}

export function parseReasoningEffortOptions(raw: unknown): ReasoningEffortWire[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const out: ReasoningEffortWire[] = []
  const seen = new Set<ReasoningEffortWire>()
  for (const entry of raw) {
    const token =
      typeof entry === 'string'
        ? entry
        : isRecord(entry) && typeof entry.value === 'string'
          ? entry.value
          : undefined
    if (token === undefined) continue
    const effort = parseReasoningEffortToken(token)
    if (effort === undefined || seen.has(effort)) continue
    seen.add(effort)
    out.push(effort)
  }
  return out.length > 0 ? out : undefined
}

export function buildThinkingLevelMap(
  efforts: readonly ReasoningEffortWire[] = LEGACY_REASONING_EFFORTS,
): ThinkingLevelMap {
  const offered = new Set(efforts.length > 0 ? efforts : LEGACY_REASONING_EFFORTS)
  return {
    off: offered.has('none') ? 'none' : null,
    minimal: offered.has('minimal') ? 'minimal' : null,
    low: offered.has('low') ? 'low' : null,
    medium: offered.has('medium') ? 'medium' : null,
    high: offered.has('high') ? 'high' : null,
    xhigh: offered.has('xhigh') ? 'xhigh' : null,
  }
}

/** Always-on reasoning models reject a selectable effort but still reason. */
export function isAlwaysOnReasoningModel(id: string): boolean {
  return /composer[-_]?2\.5/i.test(id)
}

export const ALWAYS_ON_REASONING_THINKING_LEVEL_MAP: ThinkingLevelMap = {
  off: null,
  minimal: null,
  low: null,
  medium: null,
  high: 'high',
  xhigh: null,
}

export function thinkingLevelMapForCatalog(entry: CatalogModel): ThinkingLevelMap | undefined {
  if (!entry.reasoning) return undefined
  if (isAlwaysOnReasoningModel(entry.id) && !entry.reasoningEfforts?.length) {
    return ALWAYS_ON_REASONING_THINKING_LEVEL_MAP
  }
  return buildThinkingLevelMap(entry.reasoningEfforts ?? LEGACY_REASONING_EFFORTS)
}

function decodeBase64UrlJson(segment: string): unknown {
  const padded =
    segment.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((segment.length + 3) % 4)
  return JSON.parse(globalThis.atob(padded)) as unknown
}

/** Unverified JWT claim peek for request attribution. Not an auth check. */
export function peekJwtUserId(token: string): string | undefined {
  const parts = token.split('.')
  const payloadSegment = parts[1]
  if (parts.length < 2 || payloadSegment === undefined) return undefined
  try {
    const payload = decodeBase64UrlJson(payloadSegment)
    if (!isRecord(payload)) return undefined
    return firstString(payload, 'sub', 'user_id', 'userId')
  } catch {
    return undefined
  }
}

export function decodeJwtPayload(token: string): Record<string, unknown> | undefined {
  const parts = token.split('.')
  const payloadSegment = parts[1]
  if (parts.length < 2 || payloadSegment === undefined) return undefined
  try {
    const payload = decodeBase64UrlJson(payloadSegment)
    return isRecord(payload) ? payload : undefined
  } catch {
    return undefined
  }
}

export function parseRemoteModelEntry(value: unknown): CatalogModel | undefined {
  if (!isRecord(value)) return undefined
  const meta = isRecord(value._meta) ? value._meta : undefined
  const hidden =
    firstBool(value, 'hidden') ?? (meta ? firstBool(meta, 'hidden') : undefined) ?? false
  if (hidden) return undefined

  const id =
    firstString(value, 'model', 'modelId', 'id') ??
    (meta ? firstString(meta, 'model', 'modelId') : undefined)
  if (id === undefined) return undefined

  const contextWindow =
    firstNumber(value, 'contextWindow', 'context_window') ??
    (meta ? firstNumber(meta, 'contextWindow', 'totalContextTokens') : undefined) ??
    DEFAULT_CONTEXT_WINDOW
  const maxCompletion =
    firstNumber(value, 'maxCompletionTokens', 'max_completion_tokens') ??
    (meta ? firstNumber(meta, 'maxCompletionTokens', 'max_completion_tokens') : undefined)
  const supportsEffort =
    firstBool(value, 'supportsReasoningEffort', 'supports_reasoning_effort') ??
    (meta ? firstBool(meta, 'supportsReasoningEffort', 'supports_reasoning_effort') : undefined) ??
    false
  const effortsRaw =
    value.reasoningEfforts ??
    value.reasoning_efforts ??
    (meta ? (meta.reasoningEfforts ?? meta.reasoning_efforts) : undefined)
  const reasoningEfforts = supportsEffort ? parseReasoningEffortOptions(effortsRaw) : undefined

  return {
    id,
    name: firstString(value, 'name') ?? id,
    reasoning: supportsEffort || isAlwaysOnReasoningModel(id),
    ...(reasoningEfforts === undefined ? {} : { reasoningEfforts }),
    input: ['text', 'image'],
    cost: resolveXaiModelCost(id),
    contextWindow,
    maxTokens: maxCompletion ?? Math.min(contextWindow, DEFAULT_MAX_OUTPUT_TOKENS),
  }
}

export function parseRemoteModels(payload: unknown): CatalogModel[] {
  if (!isRecord(payload) || !Array.isArray(payload.data)) return []
  const models: CatalogModel[] = []
  const seen = new Set<string>()
  for (const entry of payload.data) {
    const model = parseRemoteModelEntry(entry)
    if (model === undefined || seen.has(model.id)) continue
    seen.add(model.id)
    models.push(model)
  }
  return models
}

export function modelsListUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/models`
}

/**
 * grok-build CreateResponse leaves cache keys unset and always sends reasoning.summary.
 * Always-on models reject an explicit effort, so that field is removed.
 */
export function alignGrokBuildResponsesPayload(payload: unknown, modelId?: string): unknown {
  if (!isRecord(payload)) return payload
  const next: Record<string, unknown> = { ...payload }
  delete next.prompt_cache_key
  delete next.prompt_cache_retention
  const stripEffort = modelId !== undefined && isAlwaysOnReasoningModel(modelId)
  if (isRecord(next.reasoning)) {
    const reasoning: Record<string, unknown> = { ...next.reasoning, summary: 'concise' }
    if (stripEffort) delete reasoning.effort
    next.reasoning = reasoning
  } else {
    next.reasoning = { summary: 'concise' }
  }
  return next
}
