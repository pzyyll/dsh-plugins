// ABOUTME: Exchanges xAI device-code and refresh grants for SuperGrok session tokens.
// ABOUTME: Polling follows the issuer interval, including slow_down, and stops on abort.

import { setTimeout as sleep } from 'node:timers/promises'
import {
  CLIENT_SURFACE,
  DEVICE_AUTHORIZATION_URL,
  DEVICE_CODE_DEFAULT_EXPIRES_MS,
  DEVICE_CODE_DEFAULT_INTERVAL_MS,
  DEVICE_CODE_GRANT_TYPE,
  DEVICE_CODE_MIN_INTERVAL_MS,
  DEVICE_CODE_SLOW_DOWN_INCREMENT_MS,
  GROK_CLIENT_VERSION,
  OAUTH_POLLING_SAFETY_MARGIN_MS,
  OAUTH_REFERRER,
  OAUTH_SCOPE,
  OIDC_CLIENT_ID,
  TOKEN_URL,
} from './constants.ts'
import { credentialsFromTokens, type SuperGrokCredentials } from './grok-auth.ts'

export interface TokenResponse {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  id_token?: string
}

export interface DeviceCode {
  device_code: string
  user_code: string
  verification_uri: string
  verification_uri_complete?: string
  expires_in?: number
  interval?: number
}

interface DeviceTokenErrorBody {
  error?: string
  error_description?: string
}

function authHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/x-www-form-urlencoded',
    Accept: 'application/json',
    'x-grok-client-version': GROK_CLIENT_VERSION,
    'x-grok-client-surface': CLIENT_SURFACE,
  }
}

function positiveSecondsToMs(value: unknown, defaultMs: number): number {
  const seconds = Number(value)
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : defaultMs
}

async function responseText(response: Response): Promise<string> {
  return response.text().catch(() => '')
}

export async function requestDeviceCode(signal?: AbortSignal): Promise<DeviceCode> {
  const response = await globalThis.fetch(DEVICE_AUTHORIZATION_URL, {
    method: 'POST',
    headers: authHeaders(),
    body: new URLSearchParams({
      client_id: OIDC_CLIENT_ID,
      scope: OAUTH_SCOPE,
      referrer: OAUTH_REFERRER,
    }).toString(),
    signal,
  })
  if (!response.ok) {
    const detail = await responseText(response)
    throw new Error(
      `xAI device code request failed (${response.status})${detail ? `: ${detail}` : ''}`,
    )
  }
  const json = (await response.json()) as DeviceCode
  if (!json.device_code || !json.user_code || !json.verification_uri) {
    throw new Error(
      'xAI device code response is missing device_code, user_code, or verification_uri',
    )
  }
  return json
}

export function deviceInstructions(device: DeviceCode): { url: string; code: string } {
  return {
    url: device.verification_uri_complete ?? device.verification_uri,
    code: device.user_code,
  }
}

export async function pollDeviceCodeToken(
  device: DeviceCode,
  signal?: AbortSignal,
): Promise<TokenResponse> {
  const expiresInMs = positiveSecondsToMs(device.expires_in, DEVICE_CODE_DEFAULT_EXPIRES_MS)
  const deadline = Date.now() + expiresInMs
  let intervalMs = Math.max(
    positiveSecondsToMs(device.interval, DEVICE_CODE_DEFAULT_INTERVAL_MS),
    DEVICE_CODE_MIN_INTERVAL_MS,
  )

  while (Date.now() < deadline) {
    const response = await globalThis.fetch(TOKEN_URL, {
      method: 'POST',
      headers: authHeaders(),
      body: new URLSearchParams({
        grant_type: DEVICE_CODE_GRANT_TYPE,
        client_id: OIDC_CLIENT_ID,
        device_code: device.device_code,
      }).toString(),
      signal,
    })
    if (response.ok) return (await response.json()) as TokenResponse

    const body = (await response.json().catch(() => ({}))) as DeviceTokenErrorBody
    const remaining = Math.max(0, deadline - Date.now())
    if (body.error === 'authorization_pending') {
      await sleep(Math.min(intervalMs + OAUTH_POLLING_SAFETY_MARGIN_MS, remaining), undefined, {
        signal,
      })
      continue
    }
    if (body.error === 'slow_down') {
      intervalMs += DEVICE_CODE_SLOW_DOWN_INCREMENT_MS
      await sleep(Math.min(intervalMs + OAUTH_POLLING_SAFETY_MARGIN_MS, remaining), undefined, {
        signal,
      })
      continue
    }
    if (body.error === 'access_denied' || body.error === 'authorization_denied') {
      throw new Error('xAI device authorization was denied')
    }
    if (body.error === 'expired_token') throw new Error('xAI device code expired; run login again')
    const detail = body.error_description ?? body.error ?? ''
    throw new Error(
      `xAI device token exchange failed (${response.status})${detail ? `: ${detail}` : ''}`,
    )
  }
  throw new Error('xAI device authorization timed out')
}

export function credentialsFromTokenResponse(
  tokens: TokenResponse,
  previous?: SuperGrokCredentials,
): SuperGrokCredentials {
  if (!tokens.access_token) throw new Error('xAI token response is missing access_token')
  if (!tokens.refresh_token && !previous?.refresh)
    throw new Error('xAI token response is missing refresh_token')
  return credentialsFromTokens(
    {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? previous?.refresh ?? '',
      ...(typeof tokens.expires_in === 'number' ? { expiresInSeconds: tokens.expires_in } : {}),
      ...(tokens.id_token === undefined ? {} : { idToken: tokens.id_token }),
    },
    previous,
  )
}

export async function refreshAccessToken(
  credentials: SuperGrokCredentials,
  signal?: AbortSignal,
): Promise<SuperGrokCredentials> {
  if (!credentials.refresh) throw new Error('xAI token refresh requires a refresh_token')
  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: credentials.refresh,
    client_id: OIDC_CLIENT_ID,
  })
  if (credentials.principalType) params.set('principal_type', credentials.principalType)
  if (credentials.principalId) params.set('principal_id', credentials.principalId)
  const response = await globalThis.fetch(TOKEN_URL, {
    method: 'POST',
    headers: authHeaders(),
    body: params.toString(),
    signal,
  })
  if (!response.ok) {
    const detail = await responseText(response)
    throw new Error(`xAI token refresh failed (${response.status})${detail ? `: ${detail}` : ''}`)
  }
  return credentialsFromTokenResponse((await response.json()) as TokenResponse, credentials)
}

export async function loginWithDeviceCode(signal?: AbortSignal): Promise<SuperGrokCredentials> {
  const device = await requestDeviceCode(signal)
  return credentialsFromTokenResponse(await pollDeviceCodeToken(device, signal))
}
