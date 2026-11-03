// ABOUTME: Builds the SuperGrok pi-ai provider and applies the cli-chat-proxy request contract.
// ABOUTME: Product headers and Responses body alignment run for every stream, including subagents.

import { createHash, randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { hostname } from 'node:os'
import { dirname } from 'node:path'
import { attributionHeaders } from '@deepseek-ai/dsh-llm'
import { clampThinkingLevel } from '@earendil-works/pi-ai/models'
import { openAIResponsesApi } from '@earendil-works/pi-ai/api/openai-responses.lazy'
import type { OpenAIResponsesOptions } from '@earendil-works/pi-ai/api/openai-responses'
import type {
  Api,
  Model,
  Provider,
  ProviderHeaders,
  SimpleStreamOptions,
  TranscriptContext,
} from '@earendil-works/pi-ai'
import {
  alignGrokBuildResponsesPayload,
  thinkingLevelMapForCatalog,
  type CatalogModel,
} from './catalog.ts'
import {
  AUTHENTICATE_RESPONSE_HEADER,
  AUTHENTICATE_RESPONSE_VALUE,
  CLIENT_IDENTIFIER,
  CLIENT_IDENTIFIER_HEADER,
  CLIENT_MODE_HEADER,
  CLIENT_MODE_VALUE,
  CLI_CHAT_PROXY_BASE_URL,
  GROK_CLIENT_VERSION,
  MODEL_OVERRIDE_HEADER,
  SESSION_ID_HEADER,
  TOKEN_AUTH_HEADER,
  TOKEN_AUTH_VALUE,
  USER_ID_HEADER,
} from './constants.ts'
import { resolveGrokUserId, type SuperGrokCredentials } from './grok-auth.ts'
import { grokAgentIdPath } from './grok-paths.ts'
import { agentIdPath } from './paths.ts'

const RESPONSES = openAIResponsesApi()
type SuperGrokStreamOptions = SimpleStreamOptions & OpenAIResponsesOptions

const RESPONSES_COMPAT = {
  supportsDeveloperRole: false,
  sessionAffinityFormat: 'openai-nosession',
  supportsLongCacheRetention: false,
} as const

function platformOs(): string {
  switch (process.platform) {
    case 'darwin':
      return 'macos'
    case 'win32':
      return 'windows'
    default:
      return process.platform
  }
}

function platformArch(): string {
  switch (process.arch) {
    case 'arm64':
      return 'aarch64'
    case 'x64':
      return 'x86_64'
    default:
      return process.arch
  }
}

export function grokUserAgent(): string {
  return `${CLIENT_IDENTIFIER}/${GROK_CLIENT_VERSION} (${platformOs()}; ${platformArch()})`
}

function readAgentIdFile(path: string): string | undefined {
  try {
    const cached = readFileSync(path, 'utf8').trim()
    return cached.length > 0 ? cached : undefined
  } catch {
    return undefined
  }
}

export function resolveAgentId(): string {
  const fromGrok = readAgentIdFile(grokAgentIdPath())
  if (fromGrok) return fromGrok
  const ownedPath = agentIdPath()
  const owned = readAgentIdFile(ownedPath)
  if (owned) return owned
  const host = hostname()
  const id =
    host.length > 0
      ? createHash('sha1')
          .update(`agent_id:${host}`)
          .digest('hex')
          .replace(/^(.{8})(.{4})(.{4})(.{4})(.{12}).*$/, '$1-$2-$3-$4-$5')
      : randomUUID()
  try {
    mkdirSync(dirname(ownedPath), { recursive: true })
    const tmp = `${ownedPath}.tmp.${process.pid}.${Date.now()}`
    writeFileSync(tmp, `${id}\n`, { encoding: 'utf8', mode: 0o600 })
    renameSync(tmp, ownedPath)
  } catch {
    // The header can still use the in-memory id when the cache file cannot be written.
  }
  return id
}

let agentId: string | undefined
function getAgentId(): string {
  agentId ??= resolveAgentId()
  return agentId
}

export function isCliChatProxyUrl(url: string | undefined): boolean {
  if (!url) return false
  try {
    const host = new URL(url).hostname
    return (
      host === 'cli-chat-proxy.grok.com' ||
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '[::1]'
    )
  } catch {
    return false
  }
}

export function productHeaders(): Record<string, string> {
  return {
    'x-grok-client-version': GROK_CLIENT_VERSION,
    [CLIENT_IDENTIFIER_HEADER]: CLIENT_IDENTIFIER,
    [CLIENT_MODE_HEADER]: CLIENT_MODE_VALUE,
  }
}

/** Model discovery uses its own identity header, not the sampling request headers. */
export function catalogHeaders(
  credentials: SuperGrokCredentials,
  etag?: string,
): Record<string, string> {
  const userId = resolveGrokUserId(credentials.access, credentials)
  return {
    Accept: 'application/json',
    Authorization: `Bearer ${credentials.access}`,
    [TOKEN_AUTH_HEADER]: TOKEN_AUTH_VALUE,
    'x-grok-client-version': GROK_CLIENT_VERSION,
    [CLIENT_MODE_HEADER]: CLIENT_MODE_VALUE,
    ...(userId === undefined ? {} : { 'x-userid': userId }),
    ...(credentials.email === undefined ? {} : { 'x-email': credentials.email }),
    ...(etag === undefined ? {} : { 'If-None-Match': etag }),
  }
}

/** grok-shell prefix first so the proxy can recognize the client; Harness attribution stays on the same header. */
export function subscriptionUserAgent(): string {
  return `${grokUserAgent()} ${attributionHeaders()['user-agent']}`
}

export function subscriptionHeaders(
  model: Model<Api>,
  options: SimpleStreamOptions,
  credentials: SuperGrokCredentials | undefined,
): ProviderHeaders {
  const headers: ProviderHeaders = {}
  for (const source of [model.headers, options.headers]) {
    for (const [name, value] of Object.entries(source ?? {})) headers[name.toLowerCase()] = value
  }
  delete headers['user-agent']
  Object.assign(headers, productHeaders())
  headers['user-agent'] = subscriptionUserAgent()
  const sessionId =
    options.sessionId ||
    (typeof headers[SESSION_ID_HEADER] === 'string' ? headers[SESSION_ID_HEADER] : '') ||
    randomUUID()
  const authorization = headers.authorization
  const accessToken =
    authorization === undefined
      ? options.apiKey
      : authorization?.trim().match(/^Bearer\s+(.+)$/i)?.[1]
  const proxy = isCliChatProxyUrl(model.baseUrl)
  headers['x-grok-conv-id'] = headers['x-grok-conv-id'] || sessionId
  headers['x-grok-req-id'] = `xai-perm-auto-${randomUUID()}`
  headers[SESSION_ID_HEADER] = sessionId
  headers[MODEL_OVERRIDE_HEADER] = model.id
  headers['x-grok-agent-id'] = getAgentId()
  headers[USER_ID_HEADER] = proxy ? (resolveGrokUserId(accessToken, credentials) ?? null) : null
  headers[TOKEN_AUTH_HEADER] = proxy ? TOKEN_AUTH_VALUE : null
  headers[AUTHENTICATE_RESPONSE_HEADER] = proxy ? AUTHENTICATE_RESPONSE_VALUE : null
  headers.session_id = null
  return headers
}

export function catalogToModel(entry: CatalogModel, baseUrl: string): Model<'openai-responses'> {
  const thinkingLevelMap = thinkingLevelMapForCatalog(entry)
  return {
    id: entry.id,
    name: entry.name,
    api: 'openai-responses',
    provider: 'xai-supergrok',
    baseUrl,
    reasoning: entry.reasoning,
    ...(thinkingLevelMap === undefined ? {} : { thinkingLevelMap }),
    input: [...entry.input],
    cost: { ...entry.cost },
    contextWindow: entry.contextWindow,
    maxTokens: entry.maxTokens,
    compat: { ...RESPONSES_COMPAT },
  }
}

export function streamSuperGrok(
  model: Model<Api>,
  context: TranscriptContext,
  options: SuperGrokStreamOptions,
  credentials: SuperGrokCredentials | undefined,
) {
  const requestModel: Model<'openai-responses'> = {
    ...model,
    api: 'openai-responses',
    provider: model.provider,
    baseUrl: model.baseUrl,
    headers: undefined,
    compat: { ...model.compat, ...RESPONSES_COMPAT },
  }
  const requestOptions: SuperGrokStreamOptions = {
    ...options,
    headers: subscriptionHeaders(model, options, credentials),
    onPayload: async (payload, payloadModel) => {
      const aligned = alignGrokBuildResponsesPayload(payload, model.id)
      const replacement = await options.onPayload?.(aligned, payloadModel)
      return alignGrokBuildResponsesPayload(
        replacement === undefined ? aligned : replacement,
        model.id,
      )
    },
  }
  const needsApiStream =
    'reasoningEffort' in options || 'reasoningSummary' in options || 'serviceTier' in options
  if (!needsApiStream) return RESPONSES.streamSimple(requestModel, context, requestOptions)
  if (options.reasoningEffort === undefined && options.reasoning !== undefined) {
    const reasoning = clampThinkingLevel(requestModel, options.reasoning)
    // The SDK enables medium effort for a summary alone; keep a clamped off level off.
    if (reasoning === 'off') requestOptions.reasoningSummary = null
    else requestOptions.reasoningEffort = reasoning
  }
  return RESPONSES.stream(requestModel, context, requestOptions)
}

function asStreamOptions(options: object | undefined): SuperGrokStreamOptions {
  return (options ?? {}) as SuperGrokStreamOptions
}

export function createSuperGrokProvider(
  models: readonly Model<'openai-responses'>[],
  credentials: () => SuperGrokCredentials | undefined,
): Provider {
  const listed = models
  return {
    id: 'xai-supergrok',
    name: 'xAI SuperGrok',
    baseUrl: listed[0]?.baseUrl ?? CLI_CHAT_PROXY_BASE_URL,
    auth: {
      apiKey: {
        name: 'xAI SuperGrok subscription',
        resolve: ({ credential }) =>
          Promise.resolve(
            credential?.key === undefined
              ? undefined
              : { auth: { apiKey: credential.key }, source: 'xAI SuperGrok' },
          ),
      },
    },
    getModels: () => listed,
    stream: (model, context, options) =>
      streamSuperGrok(model, context, asStreamOptions(options), credentials()),
    streamSimple: (model, context, options) =>
      streamSuperGrok(model, context, options ?? {}, credentials()),
  }
}
