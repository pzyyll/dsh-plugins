// ABOUTME: Checks one-shot Grok Build import and OAuth token claim mapping.
// ABOUTME: Fixtures stay on disk in a temp directory and never call auth.x.ai.

import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { OIDC_CLIENT_ID, OIDC_ISSUER } from '../src/constants.ts'
import {
  credentialsFromTokens,
  describeGrokAuthSession,
  importCredentialsFromGrokAuth,
  isCredentialExpired,
} from '../src/grok-auth.ts'
import { authScopeKey } from '../src/grok-paths.ts'
import { credentialsFromTokenResponse } from '../src/oauth.ts'

function jwt(payload: Record<string, unknown>): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `header.${body}.sig`
}

test('importCredentialsFromGrokAuth copies the OIDC session and skips a web-login-only entry', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-xai-auth-'))
  const path = join(dir, 'auth.json')
  const scope = authScopeKey()
  writeFileSync(
    path,
    JSON.stringify({
      'https://auth.x.ai::other': {
        key: 'web-access',
        auth_mode: 'web_login',
        refresh_token: 'web-refresh',
        oidc_issuer: OIDC_ISSUER,
      },
      [scope]: {
        key: jwt({ sub: 'user-1' }),
        auth_mode: 'oidc',
        refresh_token: 'refresh-1',
        email: 'ada@example.com',
        expires_at: '2099-01-01T00:00:00.000Z',
        oidc_issuer: OIDC_ISSUER,
        oidc_client_id: OIDC_CLIENT_ID,
        principal_type: 'User',
        principal_id: 'user-1',
      },
    }),
  )
  const imported = importCredentialsFromGrokAuth(path)
  assert.ok(imported)
  assert.equal(imported.refresh, 'refresh-1')
  assert.equal(imported.email, 'ada@example.com')
  assert.equal(imported.userId, 'user-1')
  assert.equal(describeGrokAuthSession(imported), 'ada@example.com')
  assert.equal(isCredentialExpired(imported, Date.parse('2080-01-01T00:00:00.000Z')), false)
})

test('credentialsFromTokens uses a team principal as the user id and keeps the refresh profile', () => {
  const previous = credentialsFromTokens({
    accessToken: jwt({ sub: 'ignored' }),
    refreshToken: 'old-refresh',
    expiresInSeconds: 3600,
    idToken: jwt({ sub: 'user-1', email: 'ada@example.com' }),
  })
  const next = credentialsFromTokens(
    {
      accessToken: jwt({ principal_type: 'Team', principal_id: 'team-9' }),
      refreshToken: 'new-refresh',
      expiresInSeconds: 120,
      idToken: jwt({ sub: 'user-1', email: 'ada@example.com' }),
    },
    previous,
    new Date('2026-01-01T00:00:00.000Z'),
  )
  assert.equal(next.userId, 'team-9')
  assert.equal(next.email, undefined)
  assert.equal(next.teamId, 'team-9')
  assert.equal(next.refresh, 'new-refresh')
  assert.equal(next.oidcIssuer, OIDC_ISSUER)
  assert.throws(() => credentialsFromTokenResponse({ access_token: 'access-2' }), /refresh_token/)
})
