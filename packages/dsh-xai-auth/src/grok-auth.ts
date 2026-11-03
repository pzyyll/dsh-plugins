// ABOUTME: Reads a Grok Build session and builds Harness-owned SuperGrok credentials.
// ABOUTME: Import copies tokens once; refresh never writes ~/.grok/auth.json.

import { readFileSync } from 'node:fs'
import { decodeJwtPayload, isRecord, peekJwtUserId } from './catalog.ts'
import { EARLY_INVALIDATION_MS, OIDC_CLIENT_ID, OIDC_ISSUER, TOKEN_TTL_MS } from './constants.ts'
import { authScopeKey, grokAuthPath } from './grok-paths.ts'

export interface GrokAuthEntry {
  key: string
  auth_mode?: string
  create_time?: string
  user_id?: string
  email?: string | null
  first_name?: string | null
  last_name?: string | null
  principal_type?: string | null
  principal_id?: string | null
  team_id?: string | null
  coding_data_retention_opt_out?: boolean
  refresh_token?: string | null
  expires_at?: string | null
  oidc_issuer?: string | null
  oidc_client_id?: string | null
  [key: string]: unknown
}

export type GrokAuthStore = Record<string, GrokAuthEntry>

/** Stored grant payload. JSON-safe; the credential seam does not interpret it. */
export interface SuperGrokCredentials {
  access: string
  refresh: string
  expires: number
  userId?: string
  email?: string
  firstName?: string
  lastName?: string
  principalType?: string
  principalId?: string
  teamId?: string
  codingDataRetentionOptOut?: boolean
  oidcIssuer?: string
  oidcClientId?: string
  createTime?: string
}

export function isGrokAuthEntry(value: unknown): value is GrokAuthEntry {
  return isRecord(value) && typeof value.key === 'string' && value.key.length > 0
}

export function readGrokAuthStore(path: string = grokAuthPath()): GrokAuthStore {
  try {
    const raw = readFileSync(path, 'utf8').trim()
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (!isRecord(parsed)) return {}
    const store: GrokAuthStore = {}
    for (const [scope, entry] of Object.entries(parsed)) {
      if (isGrokAuthEntry(entry)) store[scope] = entry
    }
    return store
  } catch {
    return {}
  }
}

function isSessionAuthMode(mode: string | undefined): boolean {
  const normalized = (mode ?? 'oidc').toLowerCase()
  return normalized === 'oidc' || normalized === 'web_login' || normalized === 'grok'
}

export function findSessionAuth(
  store: GrokAuthStore = readGrokAuthStore(),
  preferredScope: string = authScopeKey(),
): { scope: string; entry: GrokAuthEntry } | undefined {
  const preferred = store[preferredScope]
  if (preferred?.refresh_token && isSessionAuthMode(preferred.auth_mode)) {
    return { scope: preferredScope, entry: preferred }
  }
  for (const [scope, entry] of Object.entries(store)) {
    if (!entry.refresh_token || !entry.oidc_issuer) continue
    if (!isSessionAuthMode(entry.auth_mode)) continue
    if (String(entry.auth_mode).toLowerCase() === 'web_login') continue
    return { scope, entry }
  }
  if (preferred?.key) return { scope: preferredScope, entry: preferred }
  return undefined
}

function parseIsoMs(value: string | null | undefined): number | undefined {
  if (!value) return undefined
  const ms = Date.parse(value)
  return Number.isFinite(ms) ? ms : undefined
}

export function isCredentialExpired(
  credentials: Pick<SuperGrokCredentials, 'expires'>,
  nowMs: number = Date.now(),
): boolean {
  return nowMs >= credentials.expires
}

export function grokAuthToCredentials(
  entry: GrokAuthEntry,
  nowMs: number = Date.now(),
): SuperGrokCredentials {
  const expiresMs = parseIsoMs(entry.expires_at ?? undefined)
  const createdMs = parseIsoMs(entry.create_time) ?? nowMs
  const hardExpiry = expiresMs ?? createdMs + TOKEN_TTL_MS
  const userId =
    (typeof entry.user_id === 'string' && entry.user_id) || peekJwtUserId(entry.key) || undefined
  return {
    access: entry.key,
    refresh: entry.refresh_token ?? '',
    expires: Math.max(nowMs, hardExpiry - EARLY_INVALIDATION_MS),
    ...(userId === undefined ? {} : { userId }),
    ...(entry.email ? { email: entry.email } : {}),
    ...(entry.first_name ? { firstName: entry.first_name } : {}),
    ...(entry.last_name ? { lastName: entry.last_name } : {}),
    ...(entry.principal_type ? { principalType: entry.principal_type } : {}),
    ...(entry.principal_id ? { principalId: entry.principal_id } : {}),
    ...(entry.team_id ? { teamId: entry.team_id } : {}),
    ...(typeof entry.coding_data_retention_opt_out === 'boolean'
      ? { codingDataRetentionOptOut: entry.coding_data_retention_opt_out }
      : {}),
    ...(entry.oidc_issuer ? { oidcIssuer: entry.oidc_issuer } : {}),
    ...(entry.oidc_client_id ? { oidcClientId: entry.oidc_client_id } : {}),
    ...(entry.create_time ? { createTime: entry.create_time } : {}),
  }
}

export function importCredentialsFromGrokAuth(
  path: string = grokAuthPath(),
): SuperGrokCredentials | undefined {
  const found = findSessionAuth(readGrokAuthStore(path))
  if (!found?.entry.refresh_token) return undefined
  return grokAuthToCredentials(found.entry)
}

export function describeGrokAuthSession(credentials: SuperGrokCredentials): string {
  return credentials.email || credentials.userId || 'existing session'
}

/** Use stored principal metadata only for its own token, then fall back to JWT attribution. */
export function resolveGrokUserId(
  accessToken: string | undefined,
  credentials: SuperGrokCredentials | undefined,
): string | undefined {
  const storedUser =
    credentials !== undefined && credentials.access === accessToken ? credentials.userId : undefined
  return storedUser || (accessToken ? peekJwtUserId(accessToken) : undefined)
}

function firstClaim(obj: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = obj[key]
    if (typeof value === 'string' && value.length > 0) return value
  }
  return undefined
}

export function credentialsFromTokens(
  tokens: {
    accessToken: string
    refreshToken: string
    expiresInSeconds?: number
    idToken?: string
  },
  previous?: SuperGrokCredentials,
  now: Date = new Date(),
): SuperGrokCredentials {
  const accessClaims = decodeJwtPayload(tokens.accessToken) ?? {}
  const idClaims = tokens.idToken ? (decodeJwtPayload(tokens.idToken) ?? {}) : {}
  const principalType =
    firstClaim(accessClaims, 'principal_type', 'principalType') ?? previous?.principalType
  const principalId =
    firstClaim(accessClaims, 'principal_id', 'principalId') ?? previous?.principalId
  const tokenTeamId = firstClaim(accessClaims, 'team_id', 'teamId')
  const idSub = firstClaim(idClaims, 'sub', 'user_id', 'userId')
  const idEmail = firstClaim(idClaims, 'email')

  let userId = idSub ?? previous?.userId
  let email = idEmail ?? previous?.email
  let teamId = tokenTeamId ?? previous?.teamId
  if (principalType === 'Team' && principalId) {
    userId = principalId
    email = undefined
    teamId = principalId
  } else if (principalType === 'Organization' && principalId) {
    userId = principalId
    email = undefined
  }

  const expiresMs =
    tokens.expiresInSeconds && tokens.expiresInSeconds > 0
      ? now.getTime() + tokens.expiresInSeconds * 1000
      : now.getTime() + TOKEN_TTL_MS

  return {
    access: tokens.accessToken,
    refresh: tokens.refreshToken,
    expires: Math.max(now.getTime(), expiresMs - EARLY_INVALIDATION_MS),
    ...(userId === undefined ? {} : { userId }),
    ...(email === undefined ? {} : { email }),
    ...(previous?.firstName === undefined ? {} : { firstName: previous.firstName }),
    ...(previous?.lastName === undefined ? {} : { lastName: previous.lastName }),
    ...(principalType === undefined ? {} : { principalType }),
    ...(principalId === undefined ? {} : { principalId }),
    ...(teamId === undefined ? {} : { teamId }),
    ...(previous?.codingDataRetentionOptOut === undefined
      ? {}
      : { codingDataRetentionOptOut: previous.codingDataRetentionOptOut }),
    oidcIssuer: previous?.oidcIssuer ?? OIDC_ISSUER,
    oidcClientId: previous?.oidcClientId ?? OIDC_CLIENT_ID,
    ...(previous?.createTime === undefined
      ? { createTime: now.toISOString() }
      : { createTime: previous.createTime }),
  }
}

export function isSuperGrokCredentials(value: unknown): value is SuperGrokCredentials {
  return (
    isRecord(value) &&
    typeof value.access === 'string' &&
    value.access.length > 0 &&
    typeof value.refresh === 'string' &&
    typeof value.expires === 'number' &&
    Number.isFinite(value.expires)
  )
}
