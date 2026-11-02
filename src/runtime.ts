// ABOUTME: Owns the SuperGrok credential, model catalog, and pi-ai adapter profile.
// ABOUTME: Each request refreshes an expired access token under the credential-store lock.

import type { Credential, CredentialStore } from '@earendil-works/pi-ai'
import type { Context } from '@deepseek-ai/cordis'
import { credentialKey, type CredentialRecord } from '@deepseek-ai/dsh-credentials'
import { LlmError, resolveImageAttachmentAccess, resolveRetryPolicy } from '@deepseek-ai/dsh-llm'
import {
  PiAiAdapter,
  type PiAiAdapterOptions,
  type ResolvedPiAiProviderProfile,
} from '@deepseek-ai/dsh-llm-pi-ai'
import {
  FALLBACK_CATALOG,
  modelsListUrl,
  parseRemoteModels,
  type CatalogModel,
} from './catalog.ts'
import {
  CLIENT_MODE_VALUE,
  GROK_CLIENT_VERSION,
  MAX_REQUEST_IMAGE_BYTES,
  PLUGIN_NAME,
  PROVIDER_ID,
  PROVIDER_LABEL,
  REQUEST_IMAGE_MAX_BYTES,
  REQUEST_IMAGE_PIXEL_BUDGET,
  STREAM_IDLE_TIMEOUT_MS,
  TOKEN_AUTH_VALUE,
  USAGE_CACHE_TTL_MS,
  oauthBaseUrl,
} from './constants.ts'
import {
  describeGrokAuthSession,
  isCredentialExpired,
  isSuperGrokCredentials,
  type SuperGrokCredentials,
} from './grok-auth.ts'
import { loadModelsCatalog, saveModelsCatalog } from './models-cache.ts'
import {
  credentialsFromTokenResponse,
  deviceInstructions,
  pollDeviceCodeToken,
  refreshAccessToken,
  requestDeviceCode,
} from './oauth.ts'
import { fetchGrokUsage, type GrokUsageView } from './grok-usage.ts'
import { catalogToModel, createSuperGrokProvider } from './wire.ts'

export const CREDENTIAL_KEY = credentialKey(PLUGIN_NAME, PROVIDER_ID)

export function grantRecord(credentials: SuperGrokCredentials): CredentialRecord {
  return { kind: 'grant', payload: credentials }
}

function credentialsFromRecord(record: CredentialRecord | undefined): SuperGrokCredentials | undefined {
  if (record?.kind !== 'grant' || !isSuperGrokCredentials(record.payload)) return undefined
  return record.payload
}

export class SuperGrokRuntime {
  private models: CatalogModel[] = [...FALLBACK_CATALOG]
  private version = 0
  private profiles: ReadonlyMap<string, ResolvedPiAiProviderProfile> | undefined
  private profileVersion = -1
  private latest: SuperGrokCredentials | undefined
  private loginAbort: AbortController | undefined
  private pending: { url: string, code: string } | undefined
  private loginError: string | undefined
  private usageCache: { at: number, view: GrokUsageView } | undefined
  private usageError: string | undefined
  private usageInflight: Promise<void> | undefined
  private usageGeneration = 0
  readonly adapter: PiAiAdapter

  private readonly ctx: Context

  constructor(ctx: Context) {
    this.ctx = ctx
    const cached = loadModelsCatalog(modelsListUrl(oauthBaseUrl()))
    if (cached !== undefined) this.models = cached.models
    const options: PiAiAdapterOptions = {
      profiles: () => this.profileMap(),
      resolveApiKey: async () => this.resolveAccessToken(),
      auth: {
        credentials: {
          read: () => Promise.resolve(undefined),
          list: () => Promise.resolve([]),
          modify: (_providerId: string, mutate: (current: Credential | undefined) => Promise<Credential | undefined>) =>
            mutate(undefined),
          delete: () => Promise.resolve(),
        } satisfies CredentialStore,
        authContext: {
          env: () => Promise.resolve(undefined),
          fileExists: () => Promise.resolve(false),
        },
      },
      resolveAttachments: () => this.ctx.get('attachments'),
      resolveImageAccess: (attachments, ref) => resolveImageAttachmentAccess(
        attachments,
        hostPath => this.ctx.get('fs')?.processPathFromHostPath(hostPath),
        ref,
      ),
    }
    this.adapter = new PiAiAdapter(options)
  }

  currentModels(): readonly CatalogModel[] {
    return this.models
  }

  private profileMap(): ReadonlyMap<string, ResolvedPiAiProviderProfile> {
    if (this.profiles !== undefined && this.profileVersion === this.version) return this.profiles
    const baseUrl = oauthBaseUrl()
    const piModels = this.models.map(entry => catalogToModel(entry, baseUrl))
    const profile: ResolvedPiAiProviderProfile = {
      provider: PROVIDER_ID,
      displayName: PROVIDER_LABEL,
      baseURL: baseUrl,
      api: 'openai-responses',
      streamIdleTimeoutMs: STREAM_IDLE_TIMEOUT_MS,
      maxRequestImageBytes: MAX_REQUEST_IMAGE_BYTES,
      requestImagePixelBudget: REQUEST_IMAGE_PIXEL_BUDGET,
      requestImageMaxBytes: REQUEST_IMAGE_MAX_BYTES,
      retryPolicy: resolveRetryPolicy(undefined, 'dsh-xai-auth retryPolicy'),
      piProvider: createSuperGrokProvider(piModels, () => this.latest),
      modelErrors: new Map<string, string>(),
      configuredMaxTokens: new Map<string, number>(),
    }
    this.profiles = new Map([[PROVIDER_ID, profile]])
    this.profileVersion = this.version
    return this.profiles
  }

  private replaceModels(next: readonly CatalogModel[], announce = false): void {
    if (next.length === 0) return
    const previous = this.models.map(model => model.id).join('\n')
    this.models = [...next]
    this.version += 1
    this.profiles = undefined
    if (previous === this.models.map(model => model.id).join('\n') && !announce) return
    // dsh 0.2.1 refreshes the picker on adapter updates, not on models-updated.
    this.ctx.emit('llm/adapters-updated')
    this.ctx.emit('llm/models-updated', PROVIDER_ID)
  }

  async resolveAccessToken(signal?: AbortSignal): Promise<string> {
    const credentials = this.ctx.get('credentials')
    if (credentials === undefined) {
      throw new LlmError('xAI SuperGrok needs the credentials service to store the subscription sign-in', 'NO_CREDENTIAL_STORE')
    }
    const previousAccess = this.latest?.access
    const stored = await credentials.modifyRecord(CREDENTIAL_KEY, async (current) => {
      const existing = credentialsFromRecord(current)
      if (existing === undefined) return undefined
      if (!isCredentialExpired(existing)) return undefined
      const refreshed = await refreshAccessToken(existing, signal)
      return grantRecord(refreshed)
    })
    const ready = credentialsFromRecord(stored)
    if (ready === undefined) {
      throw new LlmError(
        'Sign in to xAI SuperGrok on the Plugins page for dsh-xai-auth.',
        'MISSING_CREDENTIAL',
      )
    }
    this.latest = ready
    if (ready.access !== previousAccess) void this.warmCatalog(ready)
    return ready.access
  }

  async warmCatalog(credentials: SuperGrokCredentials, signal?: AbortSignal, announce = false): Promise<void> {
    const baseUrl = oauthBaseUrl()
    const origin = modelsListUrl(baseUrl)
    const previous = loadModelsCatalog(origin)
    try {
      const response = await globalThis.fetch(origin, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${credentials.access}`,
          'X-XAI-Token-Auth': TOKEN_AUTH_VALUE,
          'x-grok-client-version': GROK_CLIENT_VERSION,
          'x-grok-client-mode': CLIENT_MODE_VALUE,
          ...credentials.userId === undefined ? {} : { 'x-userid': credentials.userId },
          ...credentials.email === undefined ? {} : { 'x-email': credentials.email },
          ...announce || previous?.etag === undefined ? {} : { 'If-None-Match': previous.etag },
        },
        signal,
      })
      if (response.status === 304 && previous !== undefined) {
        this.replaceModels(previous.models, announce)
        return
      }
      if (!response.ok) throw new Error(`xAI models catalog request failed (${response.status})`)
      const models = parseRemoteModels(await response.json())
      if (models.length === 0) throw new Error('xAI models catalog returned no models')
      const etag = response.headers.get('etag') ?? undefined
      saveModelsCatalog(models, { origin, ...etag === undefined ? {} : { etag } })
      this.replaceModels(models, announce)
    } catch (error) {
      this.ctx.logger.warn('dsh-xai-auth: model catalog refresh failed; keeping the cached list')
      this.ctx.logger.warn(error)
      if (previous !== undefined) this.replaceModels(previous.models)
      if (announce) throw error
    }
  }

  /** Load a stored grant and refresh its catalog. Missing sign-in is not an error. */
  async restore(): Promise<void> {
    const credentials = this.ctx.get('credentials')
    if (credentials === undefined) return
    const existing = credentialsFromRecord(await credentials.readRecord(CREDENTIAL_KEY))
    if (existing === undefined) return
    this.latest = existing
    if (isCredentialExpired(existing)) {
      await this.resolveAccessToken()
      return
    }
    await this.warmCatalog(existing)
  }

  /** The sign-in the Plugins page shows. Pending device login survives only until this process exits. */
  accountStatus(): {
    signedIn: boolean
    account?: string
    pending?: { url: string, code: string }
    error?: string
    models: string[]
    usage?: GrokUsageView
    usageError?: string
    usagePending?: boolean
  } {
    const account = this.latest === undefined ? undefined : describeGrokAuthSession(this.latest)
    if (this.latest !== undefined) this.refreshUsageSoon()
    const pending = this.usageInflight !== undefined && this.usageCache === undefined
    return {
      signedIn: this.latest !== undefined,
      models: this.models.map(model => model.id),
      ...account === undefined ? {} : { account },
      ...this.pending === undefined ? {} : { pending: this.pending },
      ...this.loginError === undefined ? {} : { error: this.loginError },
      ...this.usageCache === undefined ? {} : { usage: this.usageCache.view },
      ...this.usageError === undefined ? {} : { usageError: this.usageError },
      ...pending ? { usagePending: true } : {},
    }
  }

  /** Start one billing read when the cached meter is missing or stale. */
  private refreshUsageSoon(): void {
    if (this.usageInflight !== undefined) return
    if (this.usageCache !== undefined && Date.now() - this.usageCache.at < USAGE_CACHE_TTL_MS) return
    const generation = this.usageGeneration
    this.usageInflight = this.planUsage().then((result) => {
      if (generation !== this.usageGeneration) return
      if (result.usage !== undefined) this.usageCache = { at: Date.now(), view: result.usage }
      this.usageError = result.error
    }, (error: unknown) => {
      if (generation !== this.usageGeneration) return
      this.usageError = error instanceof Error ? error.message : 'xAI usage request failed'
    }).finally(() => {
      if (generation === this.usageGeneration) this.usageInflight = undefined
    })
  }

  private async storedCredentials(): Promise<SuperGrokCredentials | undefined> {
    if (this.latest !== undefined) return this.latest
    const credentials = this.ctx.get('credentials')
    if (credentials === undefined) return undefined
    return credentialsFromRecord(await credentials.readRecord(CREDENTIAL_KEY))
  }

  /** Read the subscription meter. A fresh result is reused until the cache expires. */
  async planUsage(): Promise<{ usage?: GrokUsageView, error?: string }> {
    const ready = await this.storedCredentials()
    if (ready === undefined) return {}
    this.latest = ready
    const cached = this.usageCache
    if (cached !== undefined && Date.now() - cached.at < USAGE_CACHE_TTL_MS) return { usage: cached.view }
    try {
      const access = await this.resolveAccessToken()
      const view = await fetchGrokUsage({ access, ...this.latest?.userId === undefined ? {} : { userId: this.latest.userId } })
      if (view === undefined) return { ...cached === undefined ? {} : { usage: cached.view }, error: 'xAI returned no SuperGrok usage.' }
      return { usage: view }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'xAI usage request failed'
      return { ...cached === undefined ? {} : { usage: cached.view }, error: message }
    }
  }

  /** Fetch the live catalog and tell the model picker to reload it. */
  async refreshModels(): Promise<{ models: string[] }> {
    const credentials = this.ctx.get('credentials')
    const stored = credentials === undefined
      ? undefined
      : credentialsFromRecord(await credentials.readRecord(CREDENTIAL_KEY))
    const ready = this.latest ?? stored
    if (ready === undefined) throw new Error('Sign in to xAI SuperGrok before refreshing the model catalog.')
    this.latest = ready
    await this.warmCatalog(ready, undefined, true)
    return { models: this.models.map(model => model.id) }
  }

  /** Return the device challenge immediately and finish the grant in the background. */
  async startDeviceLogin(): Promise<{ url: string, code: string }> {
    this.loginAbort?.abort()
    const abort = new AbortController()
    this.loginAbort = abort
    this.loginError = undefined
    const device = await requestDeviceCode(abort.signal)
    const instructions = deviceInstructions(device)
    this.pending = instructions
    void pollDeviceCodeToken(device, abort.signal)
      .then(tokens => credentialsFromTokenResponse(tokens))
      .then(credentials => this.store(credentials, abort.signal))
      .then((credentials) => {
        this.pending = undefined
        this.ctx.logger.info(`dsh-xai-auth: SuperGrok sign-in stored for ${describeGrokAuthSession(credentials)}`)
      })
      .catch((error: unknown) => {
        if (abort.signal.aborted) return
        this.pending = undefined
        this.loginError = error instanceof Error ? error.message : 'xAI SuperGrok device sign-in failed'
        this.ctx.logger.warn('dsh-xai-auth: SuperGrok device sign-in failed')
        this.ctx.logger.warn(error)
      })
    return instructions
  }

  cancelLogin(): void {
    this.loginAbort?.abort()
    this.loginAbort = undefined
    this.pending = undefined
    this.loginError = undefined
  }

  async signOut(): Promise<void> {
    this.cancelLogin()
    this.latest = undefined
    this.usageGeneration += 1
    this.usageCache = undefined
    this.usageError = undefined
    this.usageInflight = undefined
    const credentials = this.ctx.get('credentials')
    if (credentials === undefined) return
    await credentials.deleteRecord(CREDENTIAL_KEY)
  }

  async store(credentials: SuperGrokCredentials, signal?: AbortSignal): Promise<SuperGrokCredentials> {
    const service = this.ctx.get('credentials')
    if (service === undefined) throw new Error('xAI SuperGrok needs the credentials service to store the sign-in')
    this.latest = credentials
    this.usageGeneration += 1
    this.usageCache = undefined
    this.usageError = undefined
    this.usageInflight = undefined
    await this.warmCatalog(credentials, signal)
    await service.modifyRecord(CREDENTIAL_KEY, () => Promise.resolve(grantRecord(credentials)))
    return credentials
  }

}
