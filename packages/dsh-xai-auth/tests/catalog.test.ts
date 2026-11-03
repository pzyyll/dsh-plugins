// ABOUTME: Checks SuperGrok catalog parsing, effort maps, and Responses body alignment.
// ABOUTME: These cases cover the grok-build rules that do not need a network call.

import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  alignGrokBuildResponsesPayload,
  buildThinkingLevelMap,
  isAlwaysOnReasoningModel,
  parseRemoteModelEntry,
  parseRemoteModels,
  resolveXaiModelCost,
  thinkingLevelMapForCatalog,
} from '../src/catalog.ts'

test('parseRemoteModels skips hidden entries and aliases composer effort', () => {
  const models = parseRemoteModels({
    data: [
      { id: 'hidden-one', hidden: true, name: 'Hidden' },
      {
        id: 'grok-4.5',
        name: 'Grok 4.5',
        context_window: 500000,
        supportsReasoningEffort: true,
        reasoningEfforts: ['low', 'max'],
      },
      { model: 'grok-composer-2.5-fast', supports_reasoning_effort: false },
    ],
  })
  assert.deepEqual(
    models.map((model) => model.id),
    ['grok-4.5', 'grok-composer-2.5-fast'],
  )
  assert.equal(models[0]?.reasoning, true)
  assert.deepEqual(models[0]?.reasoningEfforts, ['low', 'xhigh'])
  assert.equal(models[1]?.reasoning, true)
  assert.equal(models[1]?.reasoningEfforts, undefined)
  assert.equal(isAlwaysOnReasoningModel('grok-composer-2.5-fast'), true)
  const composer = models[1]
  assert.ok(composer)
  const thinking = thinkingLevelMapForCatalog(composer)
  assert.ok(thinking)
  assert.equal(thinking.high, 'high')
  assert.equal(thinking.low, null)
})

test('legacy effort menu hides off and minimal', () => {
  const map = buildThinkingLevelMap()
  assert.equal(map.off, null)
  assert.equal(map.minimal, null)
  assert.equal(map.low, 'low')
  assert.equal(map.xhigh, 'xhigh')
})

test('unknown model ids stay zero cost and known aliases map', () => {
  assert.equal(resolveXaiModelCost('grok-build').input, 1)
  assert.equal(resolveXaiModelCost('not-a-model').output, 0)
})

test('alignGrokBuildResponsesPayload strips cache keys and forces a concise summary', () => {
  const aligned = alignGrokBuildResponsesPayload(
    {
      prompt_cache_key: 'turn',
      prompt_cache_retention: '24h',
      reasoning: { effort: 'high' },
    },
    'grok-composer-2.5-fast',
  )
  assert.deepEqual(aligned, { reasoning: { summary: 'concise' } })
})

test('alignGrokBuildResponsesPayload adds a summary when reasoning is absent', () => {
  assert.deepEqual(alignGrokBuildResponsesPayload({ input: [] }), {
    input: [],
    reasoning: { summary: 'concise' },
  })
})

test('parseRemoteModelEntry rejects a non-object', () => {
  assert.equal(parseRemoteModelEntry('grok'), undefined)
})
