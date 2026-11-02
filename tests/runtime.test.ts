// ABOUTME: Checks model catalog changes through the installed dsh Context and pi-ai adapter.
// ABOUTME: Native fetch is pre-aborted so cache fallback and refresh notifications need no live account.

import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, test } from 'node:test'
import { Context } from '@deepseek-ai/cordis'
import { FALLBACK_CATALOG, modelsListUrl } from '../src/catalog.ts'
import { PROVIDER_ID, oauthBaseUrl } from '../src/constants.ts'
import type { SuperGrokCredentials } from '../src/grok-auth.ts'
import { saveModelsCatalog } from '../src/models-cache.ts'
import { SuperGrokRuntime } from '../src/runtime.ts'

const CREDENTIALS: SuperGrokCredentials = {
  access: 'offline-test-access',
  refresh: 'offline-test-refresh',
  expires: Number.MAX_SAFE_INTEGER,
}

let tempHome: string
let previousHome: string | undefined
let previousGrokHome: string | undefined

beforeEach(() => {
  previousHome = process.env.DSH_HOME
  previousGrokHome = process.env.GROK_HOME
  tempHome = mkdtempSync(join(tmpdir(), 'dsh-xai-runtime-'))
  process.env.DSH_HOME = tempHome
  process.env.GROK_HOME = join(tempHome, 'grok')
})

afterEach(() => {
  if (previousHome === undefined) delete process.env.DSH_HOME
  else process.env.DSH_HOME = previousHome
  if (previousGrokHome === undefined) delete process.env.GROK_HOME
  else process.env.GROK_HOME = previousGrokHome
  rmSync(tempHome, { recursive: true, force: true })
})

test('the installed adapter resolves the subscription fallback models', async () => {
  const runtime = new SuperGrokRuntime(new Context())
  const expected = FALLBACK_CATALOG[0]!
  const resolved = await runtime.adapter.resolveModel(PROVIDER_ID, expected.id)
  assert.equal(resolved.provider, PROVIDER_ID)
  assert.equal(resolved.id, expected.id)
  assert.equal(resolved.name, expected.name)
  assert.equal(resolved.context?.contextWindow, expected.contextWindow)
})

test('cached catalog changes publish the supported adapter update and rebuild the model snapshot', async () => {
  const ctx = new Context()
  const runtime = new SuperGrokRuntime(ctx)
  const expected = { ...FALLBACK_CATALOG[0]!, id: 'grok-runtime-test', name: 'Runtime Test' }
  const updates: string[][] = []
  ctx.on('llm/adapters-updated', () => {
    updates.push(runtime.currentModels().map(model => model.id))
  })
  saveModelsCatalog([expected], { origin: modelsListUrl(oauthBaseUrl()) })

  await runtime.warmCatalog(CREDENTIALS, AbortSignal.abort())
  assert.deepEqual(updates, [[expected.id]])
  const resolved = await runtime.adapter.resolveModel(PROVIDER_ID, expected.id)
  assert.equal(resolved.name, expected.name)

  await runtime.warmCatalog(CREDENTIALS, AbortSignal.abort())
  assert.deepEqual(updates, [[expected.id]])
})

test('manual model refresh requires the credential store before any catalog request', async () => {
  const runtime = new SuperGrokRuntime(new Context())
  await assert.rejects(runtime.refreshModels(), { code: 'NO_CREDENTIAL_STORE' })
})
