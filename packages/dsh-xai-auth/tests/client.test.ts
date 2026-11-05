// ABOUTME: Checks bundle-page sign-in and account usage in the sidebar footer.
// ABOUTME: Exercises client rendering, status polling, and cleanup without a browser or network.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { setImmediate as nextTurn } from "node:timers/promises";
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

function loadClient(globals: Record<string, unknown> = {}): ClientRegistration {
  let registration: ClientRegistration | undefined;
  runInNewContext(client, {
    ...globals,
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

const FOOTER_SLOT = "sidebar.footer.action";
const USAGE_POLL_MS = 2000;

interface UsageNode {
  type: unknown;
  props: Record<string, unknown> & { children: unknown[] };
}

interface UsageProps {
  ctx: ClientContext;
  t: (key: string, vars?: Record<string, string>) => string;
  wide: boolean;
}

interface UsageElement {
  type: (props: UsageProps) => UsageNode | null;
  props: UsageProps;
}

interface RpcReply {
  ok: boolean;
  value?: unknown;
}

function translate(key: string, vars?: Record<string, string>): string {
  if (key === "usedReading") return "Grok usage " + (vars?.percent ?? "");
  return key;
}

function nodes(value: unknown): UsageNode[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (value === null || typeof value !== "object" || !("props" in value)) return [];
  const node = value as UsageNode;
  return [node, ...(node.props.children ?? []).flatMap(nodes)];
}

function textContent(value: unknown): string {
  if (Array.isArray(value)) return value.map(textContent).join("");
  if (typeof value === "string") return value;
  if (value === null || typeof value !== "object" || !("props" in value)) return "";
  return ((value as UsageNode).props.children ?? []).map(textContent).join("");
}

function sidebar(options: { status?: unknown; wide?: boolean } = {}) {
  const states: unknown[] = [options.status, false];
  let stateIndex = 0;
  const effects: Array<() => void | (() => void)> = [];
  const intervals = new Map<number, () => void>();
  const listeners = new Map<string, (event: { key: string }) => void>();
  const styles = new Map<string, { id: string; textContent: string }>();
  const body = {};
  const remoteCalls: Array<{ path: string; endpoint: string; args: unknown }> = [];
  let reply: RpcReply | Promise<RpcReply> = { ok: true, value: options.status };
  let failure: Error | undefined;
  const document = {
    body,
    getElementById: (id: string) => styles.get(id),
    createElement: () => ({ id: "", textContent: "" }),
    head: {
      appendChild: (style: { id: string; textContent: string }) => {
        styles.set(style.id, style);
      },
    },
    addEventListener: (name: string, listener: (event: { key: string }) => void) => {
      listeners.set(name, listener);
    },
    removeEventListener: (name: string) => {
      listeners.delete(name);
    },
  };
  const dependencies: Record<string, unknown> = {
    react: {
      Fragment: "fragment",
      createElement: (
        type: unknown,
        props: Record<string, unknown> | null,
        ...children: unknown[]
      ) => ({ type, props: { ...props, children } }),
      useState: (initial: unknown) => {
        const index = stateIndex++;
        if (!(index in states)) states[index] = initial;
        return [
          states[index],
          (next: unknown) => {
            states[index] = typeof next === "function" ? next(states[index]) : next;
          },
        ];
      },
      useEffect: (effect: () => void | (() => void)) => {
        effects.push(effect);
      },
      useRef: (initial: unknown) => ({ current: initial }),
    },
    "react-dom": {
      createPortal: (node: UsageNode, target: unknown) => {
        assert.equal(target, body);
        return node;
      },
    },
    "@deepseek-ai/dsh-client-ui-primitives": {
      useAnchoredPosition: () => ({ left: 12, top: 24 }),
    },
  };
  const plugin = loadClient({
    document,
    setInterval: (callback: () => void, delay: number) => {
      assert.equal(delay, USAGE_POLL_MS);
      const id = intervals.size + 1;
      intervals.set(id, callback);
      return id;
    },
    clearInterval: (id: number) => {
      intervals.delete(id);
    },
  }).factory((name) => {
    assert.ok(Object.hasOwn(dependencies, name), "Unexpected client dependency: " + name);
    return dependencies[name];
  });
  const renderers = new Map<string, RenderSlot>();
  const ctx = {
    effect: (register: () => unknown) => {
      register();
    },
    locale: { register: () => () => {} },
    get: () => assert.fail("Sidebar usage must not read session services"),
    inject: () => assert.fail("Sidebar usage must not inject model-selection services"),
    connection: {
      rpc: {
        call: (path: string, endpoint: string, args: unknown) => {
          remoteCalls.push({ path, endpoint, args });
          return failure === undefined ? Promise.resolve(reply) : Promise.reject(failure);
        },
      },
    },
    slots: {
      inject: (_name: string, register: () => unknown) => {
        register();
      },
      register: (slot: { name: string }, render: RenderSlot) => {
        assert.ok(!renderers.has(slot.name), "Duplicate slot registration: " + slot.name);
        renderers.set(slot.name, render);
        return () => {
          renderers.delete(slot.name);
        };
      },
    },
  };
  plugin.apply(ctx);
  const renderSlot = renderers.get(FOOTER_SLOT);
  assert.ok(renderSlot);
  return {
    renderers,
    intervals,
    listeners,
    styles,
    remoteCalls,
    render(wide = options.wide ?? true) {
      stateIndex = 0;
      effects.length = 0;
      const element = renderSlot({ t: translate, wide } as DetailProps) as unknown as UsageElement;
      assert.equal(element.props.ctx, ctx);
      return element.type(element.props);
    },
    mountEffects() {
      const cleanups = effects.map((effect) => effect());
      return () => {
        for (const cleanup of cleanups) if (typeof cleanup === "function") cleanup();
      };
    },
    setReply(value: RpcReply | Promise<RpcReply>) {
      reply = value;
    },
    setFailure(error: Error) {
      failure = error;
    },
    poll() {
      assert.equal(intervals.size, 1);
      for (const callback of intervals.values()) callback();
    },
  };
}

test("usage registers only in the sidebar footer without conversation or model services", () => {
  const view = sidebar();
  assert.deepEqual([...view.renderers.keys()], [DETAIL_SLOT, FOOTER_SLOT]);
  assert.equal(view.render(), null);
});

test("the sidebar shows signed-in account usage without a session or selected model", () => {
  const view = sidebar({
    status: { signedIn: true, usage: { credits: { percent: 12 } } },
  });
  const pill = view.render();
  assert.ok(pill);
  assert.equal(pill.props["data-wide"], "true");
  assert.equal(textContent(pill), "Grok usage 12%");
  const trigger = nodes(pill).find((node) => node.type === "button");
  assert.ok(trigger);
  assert.equal(trigger.props["aria-label"], "Grok usage 12%");
  assert.equal(trigger.props["aria-expanded"], false);
});

test("the sidebar hides a signed-out account even if stale usage is present", () => {
  for (const status of [
    undefined,
    { signedIn: false },
    { signedIn: false, usagePending: true },
    { signedIn: false, usage: { credits: { percent: 12 } } },
    { signedIn: true },
  ]) {
    assert.equal(sidebar({ status }).render(), null);
  }
});

test("signed-in usage loading has an accessible indicator in either sidebar width", () => {
  const view = sidebar({ status: { signedIn: true, usagePending: true } });
  for (const wide of [true, false]) {
    const pill = view.render(wide);
    assert.ok(pill);
    assert.equal(pill.props["data-xai-usage-pending"], "");
    const status = nodes(pill).find((node) => node.props.role === "status");
    assert.ok(status);
    assert.equal(status.props["aria-label"], "usageLoading");
    assert.equal(textContent(pill), wide ? "usageLoading" : "");
    assert.ok(nodes(pill).some((node) => node.type === "svg"));
  }
});

test("the collapsed sidebar keeps an icon and accessible label without visible text", () => {
  const view = sidebar({
    status: { signedIn: true, usage: { credits: { percent: 0 } } },
  });
  const pill = view.render(false);
  assert.ok(pill);
  assert.equal(pill.props["data-wide"], "false");
  assert.equal(textContent(pill), "");
  assert.ok(nodes(pill).some((node) => node.type === "svg"));
  const trigger = nodes(pill).find((node) => node.type === "button");
  assert.ok(trigger);
  assert.equal(trigger.props["aria-label"], "Grok usage 0%");
});

test("the sidebar opens account details in a portal and closes on Escape", () => {
  const view = sidebar({
    status: {
      signedIn: true,
      usage: { credits: { percent: 12 }, tier: "SuperGrok", prepaid: "$5" },
    },
  });
  for (const wide of [true, false]) {
    const pill = view.render(wide);
    const trigger = nodes(pill).find((node) => node.type === "button");
    assert.ok(trigger);
    (trigger.props.onClick as () => void)();
    const open = view.render(wide);
    const dialog = nodes(open).find((node) => node.props.role === "dialog");
    assert.ok(dialog);
    assert.equal(dialog.props["aria-label"], "Grok usage 12%");
    assert.match(textContent(dialog), /SuperGrok/);
    assert.match(textContent(dialog), /\$5/);
    const meter = nodes(dialog).find((node) => node.props.role === "meter");
    assert.ok(meter);
    assert.equal(meter.props["aria-valuenow"], 12);
    const unmount = view.mountEffects();
    assert.ok(view.listeners.has("keydown"));
    view.listeners.get("keydown")!({ key: "Escape" });
    assert.ok(!nodes(view.render(wide)).some((node) => node.props.role === "dialog"));
    unmount();
    assert.equal(view.intervals.size, 0);
    assert.equal(view.listeners.size, 0);
  }
});

test("global status polling detects sign-in and sign-out and retains usage on failures", async () => {
  const view = sidebar();
  assert.equal(view.render(), null);
  const unmount = view.mountEffects();
  await nextTurn();
  assert.equal(view.styles.size, 1);
  view.setReply({
    ok: true,
    value: { signedIn: true, usage: { credits: { percent: 12 } } },
  });
  view.poll();
  await nextTurn();
  assert.equal(textContent(view.render()), "Grok usage 12%");
  view.setReply({ ok: false });
  view.poll();
  await nextTurn();
  assert.equal(textContent(view.render()), "Grok usage 12%");
  view.setFailure(new Error("Connection lost"));
  view.poll();
  await nextTurn();
  assert.equal(textContent(view.render()), "Grok usage 12%");
  assert.ok(
    view.remoteCalls.every(
      (call) => call.path === "/api" && call.endpoint === "xaiSupergrok/status",
    ),
  );
  unmount();
  assert.equal(view.intervals.size, 0);

  const signedOut = sidebar({ status: { signedIn: true, usage: { credits: { percent: 12 } } } });
  assert.ok(signedOut.render());
  signedOut.setReply({ ok: true, value: { signedIn: false } });
  const stop = signedOut.mountEffects();
  await nextTurn();
  assert.equal(signedOut.render(), null);
  stop();
});

test("unmount stops status polling and ignores an in-flight response", async () => {
  const view = sidebar();
  let resolve: (reply: RpcReply) => void = () => assert.fail("Missing pending request");
  view.setReply(
    new Promise<RpcReply>((complete) => {
      resolve = complete;
    }),
  );
  view.render();
  const unmount = view.mountEffects();
  assert.equal(view.intervals.size, 1);
  unmount();
  assert.equal(view.intervals.size, 0);
  resolve({ ok: true, value: { signedIn: true, usage: { credits: { percent: 12 } } } });
  await nextTurn();
  assert.equal(view.render(), null);
});
