// ABOUTME: Checks SuperGrok billing parsing against the usage-bar credits cases.
// ABOUTME: The view is what the Plugins page renders, without a terminal bar.

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { grokUsageView, parseGrokPlanUsage } from '../src/grok-usage.ts'

const NOW = Date.parse('2026-04-01T12:00:00.000Z')

function creditsPayload(
  config: Record<string, unknown>,
  extra: Record<string, unknown> = {},
): unknown {
  return { config, ...extra }
}

test('parseGrokPlanUsage reads a weekly credit window', () => {
  const usage = parseGrokPlanUsage(
    creditsPayload({
      creditUsagePercent: 42.5,
      currentPeriod: {
        type: 'USAGE_PERIOD_TYPE_WEEKLY',
        start: '2026-03-30T00:00:00Z',
        end: '2026-04-06T00:00:00Z',
      },
    }),
    NOW,
  )
  assert.equal(usage.usable, true)
  assert.equal(usage.usagePct, 42.5)
  assert.equal(usage.windows[0]?.label, 'W')
  assert.equal(usage.windows[0]?.resetsIn, '4d 12h')
  const view = grokUsageView(usage)
  assert.equal(view?.credits?.percent, 42.5)
  assert.equal(view?.credits?.tone, 'success')
  assert.equal(view?.credits?.resetsIn, '4 天 12 小时')
  assert.equal(view?.credits?.resetsCompact, '4d 12h')
  assert.equal(view?.periodKind, 'week')
  assert.equal(view?.periodEnd, '2026-04-06T00:00:00Z')
  assert.match(view?.period ?? '', /每周/)
})

test('parseGrokPlanUsage falls back to used over monthly limit', () => {
  const usage = parseGrokPlanUsage(
    creditsPayload({
      monthlyLimit: { val: 2000 },
      used: { val: 500 },
    }),
    NOW,
  )
  assert.equal(usage.usagePct, 25)
})

test('grokUsageView formats prepaid, on-demand, and the plan name', () => {
  const usage = parseGrokPlanUsage(
    creditsPayload(
      {
        creditUsagePercent: 100,
        onDemandCap: { val: 500 },
        onDemandUsed: { val: 250 },
        prepaidBalance: { val: 1250 },
        isUnifiedBillingUser: true,
      },
      { onDemandEnabled: true, subscriptionTier: 'SuperGrokPro' },
    ),
    NOW,
  )
  assert.equal(usage.effectiveUsagePct, 50)
  const view = grokUsageView(usage)
  assert.equal(view?.tier, 'Super Grok Pro')
  assert.equal(view?.prepaid, '$12.50')
  assert.equal(view?.onDemand, '$2.50 / $5.00')
  assert.equal(view?.onDemandDisabled, false)
  assert.equal(view?.unified, true)
  assert.equal(view?.effective?.percent, 50)
  assert.equal(view?.credits?.tone, 'error')
})

test('parseGrokPlanUsage sorts product usage and clamps the percent', () => {
  const usage = parseGrokPlanUsage(
    creditsPayload({
      creditUsagePercent: 42.5,
      productUsage: [
        { product: 'PRODUCT_API', usagePercent: 12.3 },
        { product: 'PRODUCT_GROK_BUILD', usagePercent: 61.2 },
        { product: 'PRODUCT_IMAGINE', usagePercent: 150 },
        { product: 'PRODUCT_SKIP_ME' },
      ],
    }),
    NOW,
  )
  assert.deepEqual(
    usage.productUsage.map((product) => product.label),
    ['Imagine', 'Build', 'API'],
  )
  assert.equal(usage.productUsage[0]?.usagePct, 100)
  assert.equal(grokUsageView(usage)?.products[1]?.tone, 'success')
})

test('parseGrokPlanUsage rejects an empty payload', () => {
  assert.equal(parseGrokPlanUsage({}, NOW).usable, false)
  assert.equal(grokUsageView(parseGrokPlanUsage(null, NOW)), undefined)
})
