// ABOUTME: Check browser module identity and the bundle-page sign-in slot against package metadata.
// ABOUTME: Exercise the real client factory with isolated UI dependencies and no browser or network.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";

const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const client = readFileSync(new URL("../lib/client.js", import.meta.url), "utf8");
const DETAIL_SLOT = "plugins.detail.section";

type Translate = (key: string) => string;

interface DetailProps {
  subject?: { kind: string; pkg?: { name: string } };
  t: Translate;
}

interface Element {
  type: unknown;
  props: Record<string, unknown>;
}

type RenderSlot = (props: DetailProps) => Element | null;

interface ClientContext {
  effect: (register: () => unknown) => void;
  locale: { register: () => () => void };
  slots: {
    inject: (name: string, register: () => unknown) => void;
    register: (options: { name: string }, render: RenderSlot) => () => void;
  };
}

interface ClientRegistration {
  id: string;
  factory: (require: (name: string) => unknown) => { apply: (ctx: ClientContext) => void };
}

function loadClient(): ClientRegistration {
  let registration: ClientRegistration | undefined;
  runInNewContext(client, {
    window: {
      __ModuleLoader__: {
        load: (value: ClientRegistration) => {
          assert.equal(registration, undefined);
          registration = value;
        },
      },
    },
  });
  assert.ok(registration);
  return registration;
}

test("the browser module registers under the published package name", () => {
  assert.equal(loadClient().id, manifest.name);
});

test("the sign-in slot renders only for this published bundle", () => {
  const dependencies: Record<string, unknown> = {
    react: { createElement: (type: unknown, props: Record<string, unknown>) => ({ type, props }) },
    "react-dom": {},
    "@deepseek-ai/dsh-client-ui-primitives": {},
  };
  const plugin = loadClient().factory((name) => {
    assert.ok(Object.hasOwn(dependencies, name), `Unexpected client dependency: ${name}`);
    return dependencies[name];
  });
  const renderers = new Map<string, RenderSlot>();
  const ctx: ClientContext = {
    effect: (register) => {
      register();
    },
    locale: { register: () => () => {} },
    slots: {
      inject: (_name, register) => {
        register();
      },
      register: (options, render) => {
        renderers.set(options.name, render);
        return () => {
          renderers.delete(options.name);
        };
      },
    },
  };
  plugin.apply(ctx);
  const render = renderers.get(DETAIL_SLOT);
  assert.ok(render);
  const t: Translate = (key) => key;
  const element = render({ subject: { kind: "bundle", pkg: { name: manifest.name } }, t });

  assert.ok(element);
  assert.equal(typeof element.type, "function");
  assert.equal(element.props.ctx, ctx);
  assert.equal(element.props.t, t);
  for (const subject of [
    undefined,
    { kind: "bundle" },
    { kind: "entry", pkg: { name: manifest.name } },
    { kind: "bundle", pkg: { name: "@example/unrelated" } },
    { kind: "bundle", pkg: { name: "dsh-xai-auth" } },
  ]) {
    assert.equal(render({ subject, t }), null);
  }
});

const HERO_SLOT = "conversation.hero.options";
const SESSION_ID = "blank-session";

interface PillElement {
  type: (props: PillProps) => PillNode | null;
  props: PillProps;
}

interface PillProps {
  ctx: { get(name: string): unknown };
  t: (key: string, vars?: Record<string, string>) => string;
  useProjection?: (key: string, select: (value: unknown) => unknown) => unknown;
  sessionId?: string;
}

interface PillNode {
  props: Record<string, unknown> & { children?: unknown };
}

function translate(key: string, vars?: Record<string, string>): string {
  if (key === "usedReading") return "used " + (vars?.percent ?? "");
  return key;
}

function pillReact(status: unknown) {
  let useStateCalls = 0;
  return {
    Fragment: "fragment",
    createElement: (
      type: unknown,
      props: Record<string, unknown> | null,
      ...children: unknown[]
    ) => ({
      type,
      props: { ...props, children },
    }),
    useState: (initial: unknown) => {
      useStateCalls += 1;
      return [useStateCalls === 1 ? status : initial, () => {}];
    },
    useEffect: () => {},
    useRef: (initial: unknown) => ({ current: initial }),
    useSyncExternalStore: (_subscribe: unknown, getSnapshot: () => unknown) => getSnapshot(),
  };
}

function directory(provider: string | null) {
  return {
    directoryFor(sessionId: string) {
      assert.equal(sessionId, SESSION_ID);
      return {
        store: {
          getSnapshot: () => ({
            current: provider === null ? null : { provider, model: "grok" },
          }),
          subscribe: () => () => {},
        },
      };
    },
  };
}

function projection(next: unknown) {
  return (_key: string, select: (value: unknown) => unknown) => select({ lastUsed: null, next });
}

function renderHero(options: {
  status?: unknown;
  next: unknown;
  provider: string | null;
  sessionId?: string;
}): PillNode | null {
  const directories = directory(options.provider);
  const dependencies: Record<string, unknown> = {
    react: pillReact(options.status),
    "react-dom": {},
    "@deepseek-ai/dsh-client-ui-primitives": {},
  };
  const plugin = loadClient().factory((name) => {
    assert.ok(Object.hasOwn(dependencies, name), "Unexpected client dependency: " + name);
    return dependencies[name];
  });
  const renderers = new Map<string, RenderSlot>();
  const ctx = {
    effect: (register: () => unknown) => {
      register();
    },
    locale: { register: () => () => {} },
    get: (name: string) => (name === "modelDirectories" ? directories : undefined),
    slots: {
      inject: (_name: string, register: () => unknown) => {
        register();
      },
      register: (slot: { name: string }, render: RenderSlot) => {
        renderers.set(slot.name, render);
        return () => {
          renderers.delete(slot.name);
        };
      },
    },
  };
  plugin.apply(ctx as ClientContext);
  const render = renderers.get(HERO_SLOT);
  assert.ok(render);
  const element = render({
    ctx,
    t: translate,
    useProjection: projection(options.next),
    sessionId: options.sessionId === undefined ? SESSION_ID : options.sessionId,
  } as DetailProps) as unknown as PillElement;
  return element.type(element.props);
}

test("the hero pill follows the catalog default and keeps a seat while usage loads", () => {
  const pending = renderHero({ next: null, provider: "xai-supergrok" });
  assert.ok(pending);
  assert.equal(pending.props["data-xai-usage-pending"], "");
  assert.match(JSON.stringify(pending), /usageLoading/);

  const recorded = renderHero({
    next: { provider: "xai-supergrok", model: "grok" },
    provider: null,
  });
  assert.ok(recorded);
  assert.equal(recorded.props["data-xai-usage-pending"], "");
});

test("the hero pill hides for another route and for a finished reading with no credits", () => {
  assert.equal(
    renderHero({
      next: { provider: "other", model: "other" },
      provider: "xai-supergrok",
    }),
    null,
  );
  assert.equal(renderHero({ next: null, provider: "other" }), null);
  assert.equal(
    renderHero({
      next: { provider: "xai-supergrok", model: "grok" },
      provider: null,
      status: { signedIn: false },
    }),
    null,
  );
});

test("the hero pill shows the remaining percentage once credits arrive", () => {
  const pill = renderHero({
    next: null,
    provider: "xai-supergrok",
    status: { usage: { credits: { percent: 12 } } },
  });
  assert.ok(pill);
  assert.equal(pill.props["data-xai-usage-pending"], undefined);
  assert.match(JSON.stringify(pill), /used 12%/);
});
