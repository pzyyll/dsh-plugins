// ABOUTME: Check browser module identity and the bundle-page sign-in slot against package metadata.
// ABOUTME: Exercise the real client factory with isolated UI dependencies and no browser or network.

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { runInNewContext } from 'node:vm'

const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const client = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
const DETAIL_SLOT = 'plugins.detail.section'

type Translate = (key: string) => string

interface DetailProps {
  subject?: { kind: string; pkg?: { name: string } }
  t: Translate
}

interface Element {
  type: unknown
  props: Record<string, unknown>
}

type RenderSlot = (props: DetailProps) => Element | null

interface ClientContext {
  effect: (register: () => unknown) => void
  locale: { register: () => () => void }
  slots: {
    inject: (name: string, register: () => unknown) => void
    register: (options: { name: string }, render: RenderSlot) => () => void
  }
}

interface ClientRegistration {
  id: string
  factory: (require: (name: string) => unknown) => { apply: (ctx: ClientContext) => void }
}

function loadClient(): ClientRegistration {
  let registration: ClientRegistration | undefined
  runInNewContext(client, {
    window: {
      __ModuleLoader__: {
        load: (value: ClientRegistration) => {
          assert.equal(registration, undefined)
          registration = value
        },
      },
    },
  })
  assert.ok(registration)
  return registration
}

test('the browser module registers under the published package name', () => {
  assert.equal(loadClient().id, manifest.name)
})

test('the sign-in slot renders only for this published bundle', () => {
  const dependencies: Record<string, unknown> = {
    react: { createElement: (type: unknown, props: Record<string, unknown>) => ({ type, props }) },
    'react-dom': {},
    '@deepseek-ai/dsh-client-ui-primitives': {},
  }
  const plugin = loadClient().factory((name) => {
    assert.ok(Object.hasOwn(dependencies, name), `Unexpected client dependency: ${name}`)
    return dependencies[name]
  })
  const renderers = new Map<string, RenderSlot>()
  const ctx: ClientContext = {
    effect: (register) => {
      register()
    },
    locale: { register: () => () => {} },
    slots: {
      inject: (_name, register) => {
        register()
      },
      register: (options, render) => {
        renderers.set(options.name, render)
        return () => {
          renderers.delete(options.name)
        }
      },
    },
  }
  plugin.apply(ctx)
  const render = renderers.get(DETAIL_SLOT)
  assert.ok(render)
  const t: Translate = (key) => key
  const element = render({ subject: { kind: 'bundle', pkg: { name: manifest.name } }, t })

  assert.ok(element)
  assert.equal(typeof element.type, 'function')
  assert.equal(element.props.ctx, ctx)
  assert.equal(element.props.t, t)
  for (const subject of [
    undefined,
    { kind: 'bundle' },
    { kind: 'entry', pkg: { name: manifest.name } },
    { kind: 'bundle', pkg: { name: '@example/unrelated' } },
    { kind: 'bundle', pkg: { name: 'dsh-xai-auth' } },
  ]) {
    assert.equal(render({ subject, t }), null)
  }
})
