// ABOUTME: Checks bundle-page sign-in and draggable edge-docked account usage.
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
  subject?: {
    kind: string;
    pkg?: { name: string; rows?: Array<{ rowId: string; moduleName: string }> };
  };
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
      ...(globals.window as Record<string, unknown>),
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

const FOOTER_SLOT = "shell.overlay";
const USAGE_POLL_MS = 2000;

interface UsageNode {
  type: unknown;
  props: Record<string, unknown> & { children: unknown[] };
}

interface UsageProps {
  ctx: ClientContext;
  t: (key: string, vars?: Record<string, string>) => string;
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

interface PreferenceForm {
  getSnapshot: () => { status: string; value?: { showSidebarUsage: boolean }; writable: boolean };
  subscribe: (listener: () => void) => () => void;
  set: (field: string, value: boolean) => Promise<boolean>;
}

function sidebar(options: { status?: unknown; wide?: boolean; form?: PreferenceForm } = {}) {
  const componentStates = new Map<unknown, unknown[]>();
  const componentRefs = new Map<unknown, Array<{ current: unknown }>>();
  let states: unknown[] = [];
  let refs: Array<{ current: unknown }> = [];
  let stateIndex = 0;
  let refIndex = 0;
  let changed = false;
  const layoutEffects: Array<() => void | (() => void)> = [];
  let layoutCleanups: Array<void | (() => void)> = [];
  const resizeCallbacks = new Set<() => void>();
  const mutationCallbacks = new Set<() => void>();
  const timers = new Map<number, () => void>();
  let timerId = 0;
  let rect = { left: 280, right: 1200, top: 40, bottom: 800 };
  let fullscreen = false;
  const center = { inert: false, getBoundingClientRect: () => rect };
  const frame = {
    querySelector: (selector: string) => {
      assert.equal(selector, "[data-rightbar-col]");
      return { previousElementSibling: center };
    },
    hasAttribute: (name: string) => name === "data-rightbar-fullscreen" && fullscreen,
  };
  const root = {
    closest: (selector: string) => {
      assert.equal(selector, "[data-shell-overlay]");
      return { parentElement: frame };
    },
  };
  const effects: Array<() => void | (() => void)> = [];
  const intervals = new Map<number, () => void>();
  const listeners = new Map<string, (event: { key: string }) => void>();
  const styles = new Map<string, { id: string; textContent: string }>();
  const body = {};
  let outsideDismiss: (() => void) | undefined;
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
        const current = states;
        if (!(index in current)) current[index] = initial;
        return [
          current[index],
          (next: unknown) => {
            const value = typeof next === "function" ? next(current[index]) : next;
            if (value !== current[index]) changed = true;
            current[index] = value;
          },
        ];
      },
      useEffect: (effect: () => void | (() => void)) => {
        effects.push(effect);
      },
      useLayoutEffect: (effect: () => void | (() => void)) => {
        layoutEffects.push(effect);
      },
      useRef: (initial: unknown) => {
        const index = refIndex++;
        return (refs[index] ??= { current: initial });
      },
      useCallback: (callback: unknown) => callback,
      useSyncExternalStore: (_subscribe: unknown, getSnapshot: () => unknown) => getSnapshot(),
    },
    "react-dom": {
      createPortal: (node: UsageNode, target: unknown) => {
        assert.equal(target, body);
        return node;
      },
    },
    "@deepseek-ai/dsh-client-ui-primitives": {
      Switch: "switch",
      useAnchoredPosition: () => ({ left: 12, top: 24 }),
      useDismissOnOutsidePointer: (_root: unknown, open: boolean, dismiss: () => void) => {
        outsideDismiss = open ? dismiss : undefined;
      },
    },
  };
  const plugin = loadClient({
    document,
    window: { addEventListener: () => {}, removeEventListener: () => {} },
    ResizeObserver: class {
      callback: () => void;
      constructor(callback: () => void) {
        this.callback = callback;
        resizeCallbacks.add(callback);
      }
      observe() {}
      disconnect() {
        resizeCallbacks.delete(this.callback);
      }
    },
    MutationObserver: class {
      callback: () => void;
      constructor(callback: () => void) {
        this.callback = callback;
        mutationCallbacks.add(callback);
      }
      observe() {}
      disconnect() {
        mutationCallbacks.delete(this.callback);
      }
    },
    setTimeout: (callback: () => void) => {
      timers.set(++timerId, callback);
      return timerId;
    },
    clearTimeout: (id: number) => {
      timers.delete(id);
    },
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
    configForms: {
      get: (entryId: string) => {
        assert.equal(entryId, "custom-xai-row");
        return options.form;
      },
    },
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
  function renderElement(element: UsageElement) {
    states = componentStates.get(element.type) ?? [];
    componentStates.set(element.type, states);
    refs = componentRefs.get(element.type) ?? [];
    componentRefs.set(element.type, refs);
    let result: UsageNode | null = null;
    const MAX_LAYOUT_PASSES = 5;
    for (let pass = 0; pass < MAX_LAYOUT_PASSES; pass++) {
      for (const cleanup of layoutCleanups) if (typeof cleanup === "function") cleanup();
      stateIndex = 0;
      refIndex = 0;
      changed = false;
      effects.length = 0;
      layoutEffects.length = 0;
      result = element.type(element.props);
      for (const node of nodes(result)) {
        const ref = node.props.ref as { current: unknown } | undefined;
        if (ref) ref.current = node.props["data-xai-usage-pill"] === "" ? root : {};
      }
      layoutCleanups = layoutEffects.map((effect) => effect());
      if (!changed) return result;
    }
    assert.fail("Layout did not settle");
  }
  const initialElement = renderSlot({
    t: translate,
    wide: true,
  } as DetailProps) as unknown as UsageElement;
  componentStates.set(initialElement.type, [options.status, false]);
  return {
    renderers,
    intervals,
    listeners,
    styles,
    remoteCalls,
    resizeCallbacks,
    mutationCallbacks,
    dismissOutside() {
      assert.ok(outsideDismiss);
      outsideDismiss();
    },
    timers,
    resize(next: typeof rect) {
      rect = next;
      for (const callback of resizeCallbacks) callback();
    },
    hideContent(reason: "drawer" | "fullscreen") {
      if (reason === "drawer") center.inert = true;
      else fullscreen = true;
      for (const callback of mutationCallbacks) callback();
    },
    flushHoverClose() {
      const pending = [...timers.values()];
      timers.clear();
      for (const callback of pending) callback();
    },
    render(wide = options.wide ?? true) {
      const element = renderSlot({ t: translate, wide } as DetailProps) as unknown as UsageElement;
      assert.equal(element.props.ctx, ctx);
      return renderElement(element);
    },
    renderPreference() {
      const detail = renderers.get(DETAIL_SLOT)!({
        t: translate,
        subject: {
          kind: "bundle",
          pkg: {
            name: manifest.name,
            rows: [
              { rowId: "unrelated", moduleName: "@example/unrelated" },
              { rowId: "custom-xai-row", moduleName: manifest.name },
            ],
          },
        },
      }) as unknown as UsageElement;
      const panel = renderElement(detail);
      const preference = nodes(panel).find(
        (node) => options.form !== undefined && node.props.form === options.form,
      );
      assert.ok(preference, "The bundle page must render the usage preference");
      return renderElement(preference as unknown as UsageElement);
    },
    mountEffects() {
      const cleanups = effects.map((effect) => effect());
      return () => {
        for (const cleanup of [...cleanups, ...layoutCleanups])
          if (typeof cleanup === "function") cleanup();
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

test("the bundle page saves the sidebar preference through its own Host configuration form", async () => {
  let enabled = false;
  const writes: Array<[string, boolean]> = [];
  const view = sidebar({
    form: {
      getSnapshot: () => ({
        status: "ready",
        value: { showSidebarUsage: enabled },
        writable: true,
      }),
      subscribe: () => () => {},
      set: async (field, value) => {
        writes.push([field, value]);
        enabled = value;
        return true;
      },
    },
  });
  for (const next of [true, false]) {
    const control = nodes(view.renderPreference()).find((node) => node.type === "switch");
    assert.ok(control);
    assert.equal(control.props.label, "showSidebarUsage");
    assert.equal(control.props.checked, !next);
    assert.equal(control.props.disabled, false);
    (control.props.onChange as (next: boolean) => void)(next);
    assert.equal(
      nodes(view.renderPreference()).find((node) => node.type === "switch")?.props.disabled,
      true,
    );
    await nextTurn();
    assert.equal(
      nodes(view.renderPreference()).find((node) => node.type === "switch")?.props.checked,
      next,
    );
  }
  assert.deepEqual(writes, [
    ["showSidebarUsage", true],
    ["showSidebarUsage", false],
  ]);
});

test("the usage switch is disabled until the configuration is ready and writable", () => {
  for (const snapshot of [
    { status: "loading", writable: true },
    { status: "unavailable", writable: false },
    { status: "ready", writable: false, value: { showSidebarUsage: true } },
  ]) {
    const view = sidebar({
      form: {
        getSnapshot: () => snapshot,
        subscribe: () => () => {},
        set: async () => assert.fail("Read-only settings must not be written"),
      },
    });
    const control = nodes(view.renderPreference()).find((node) => node.type === "switch");
    assert.ok(control);
    assert.equal(control.props.disabled, true);
  }
});

test("refused and failed preference writes keep the accepted value and show an error", async () => {
  for (const set of [
    async () => false,
    async () => {
      throw new Error("Connection lost");
    },
  ]) {
    const view = sidebar({
      form: {
        getSnapshot: () => ({
          status: "ready",
          writable: true,
          value: { showSidebarUsage: false },
        }),
        subscribe: () => () => {},
        set,
      },
    });
    const control = nodes(view.renderPreference()).find((node) => node.type === "switch");
    assert.ok(control);
    (control.props.onChange as (next: boolean) => void)(true);
    await nextTurn();
    const result = view.renderPreference();
    assert.equal(nodes(result).find((node) => node.type === "switch")?.props.checked, false);
    assert.equal(
      nodes(result).find((node) => node.props.role === "alert")?.props.children[0],
      "saveSettingsFailed",
    );
  }
});

test("usage registers only in the shell overlay without conversation or model services", () => {
  const view = sidebar();
  assert.deepEqual([...view.renderers.keys()], [DETAIL_SLOT, FOOTER_SLOT]);
  assert.equal(view.render(), null);
});

test("the sidebar shows signed-in account usage without a session or selected model", () => {
  const view = sidebar({
    status: { showSidebarUsage: true, signedIn: true, usage: { credits: { percent: 12 } } },
  });
  const pill = view.render();
  assert.ok(pill);
  assert.equal(pill.props["data-edge"], "right");
  assert.equal(textContent(pill), "");
  const trigger = nodes(pill).find((node) => node.type === "button");
  assert.ok(trigger);
  assert.equal(trigger.props["aria-label"], "Grok usage 12%");
  assert.equal(trigger.props["aria-expanded"], false);
});

test("the sidebar hides a signed-out account even if stale usage is present", () => {
  for (const status of [
    undefined,
    { showSidebarUsage: true, signedIn: false },
    { showSidebarUsage: true, signedIn: false, usagePending: true },
    { showSidebarUsage: true, signedIn: false, usage: { credits: { percent: 12 } } },
    { showSidebarUsage: true, signedIn: true },
  ]) {
    assert.equal(sidebar({ status }).render(), null);
  }
});

test("sidebar usage is hidden unless explicitly enabled, including the loading indicator", () => {
  for (const preference of [{}, { showSidebarUsage: false }]) {
    for (const reading of [{ usage: { credits: { percent: 12 } } }, { usagePending: true }]) {
      const view = sidebar({ status: { ...preference, signedIn: true, ...reading } });
      assert.equal(view.render(true), null);
      assert.equal(view.render(false), null);
    }
  }
});

test("status polling applies sidebar visibility changes and hides an open usage panel", async () => {
  const account = { signedIn: true, usage: { credits: { percent: 12 } } };
  const view = sidebar({ status: account });
  assert.equal(view.render(), null);
  const unmount = view.mountEffects();
  await nextTurn();

  view.setReply({ ok: true, value: { ...account, showSidebarUsage: true } });
  view.poll();
  await nextTurn();
  const trigger = nodes(view.render()).find((node) => node.type === "button");
  assert.ok(trigger);
  (trigger.props.onClick as () => void)();
  assert.ok(nodes(view.render()).some((node) => node.props.role === "dialog"));

  view.setReply({ ok: true, value: { ...account, showSidebarUsage: false } });
  view.poll();
  await nextTurn();
  assert.equal(view.render(), null);
  unmount();
});

test("signed-in usage loading has an accessible indicator in either sidebar width", () => {
  const view = sidebar({ status: { showSidebarUsage: true, signedIn: true, usagePending: true } });
  for (const wide of [true, false]) {
    const pill = view.render(wide);
    assert.ok(pill);
    assert.equal(pill.props["data-xai-usage-pending"], "");
    const status = nodes(pill).find((node) => node.props.role === "status");
    assert.ok(status);
    assert.equal(status.props["aria-label"], "usageLoading");
    assert.equal(textContent(pill), "");
    assert.ok(nodes(pill).some((node) => node.type === "svg"));
  }
});

test("the collapsed sidebar keeps an icon and accessible label without visible text", () => {
  const view = sidebar({
    status: { showSidebarUsage: true, signedIn: true, usage: { credits: { percent: 0 } } },
  });
  const pill = view.render(false);
  assert.ok(pill);
  assert.equal(pill.props["data-edge"], "right");
  assert.equal(textContent(pill), "");
  assert.ok(nodes(pill).some((node) => node.type === "svg"));
  const trigger = nodes(pill).find((node) => node.type === "button");
  assert.ok(trigger);
  assert.equal(trigger.props["aria-label"], "Grok usage 0%");
});

test("the sidebar opens account details in a portal and closes on Escape", () => {
  const view = sidebar({
    status: {
      showSidebarUsage: true,
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

const SIGNED_IN_USAGE = {
  showSidebarUsage: true,
  signedIn: true,
  usage: { credits: { percent: 12 }, tier: "SuperGrok" },
};

function buttonOf(node: UsageNode | null): UsageNode {
  const button = nodes(node).find((entry) => entry.type === "button");
  assert.ok(button);
  return button;
}

function pointerTarget() {
  let captured = false;
  return {
    setPointerCapture: () => {
      captured = true;
    },
    hasPointerCapture: () => captured,
    releasePointerCapture: () => {
      captured = false;
    },
  };
}

function pointer(
  button: UsageNode,
  handler: string,
  currentTarget: ReturnType<typeof pointerTarget>,
  x: number,
  y: number,
) {
  (button.props[handler] as (event: unknown) => void)({
    pointerId: 1,
    isPrimary: true,
    button: 0,
    clientX: x,
    clientY: y,
    currentTarget,
  });
}

function placementOf(node: UsageNode | null) {
  assert.ok(node);
  return node.props.style as { left: number; top: number; visibility: string };
}

function dialogOf(node: UsageNode | null) {
  return nodes(node).find((entry) => entry.props.role === "dialog");
}

test("the icon draws a semicircular progress arc and follows the content edge on resize", () => {
  const view = sidebar({ status: SIGNED_IN_USAGE });
  const pill = view.render();
  assert.equal(placementOf(pill).left, 1176);
  assert.equal(placementOf(pill).top, 396);
  assert.equal(textContent(pill), "");
  assert.equal(
    nodes(pill).some((node) => node.type === "circle"),
    false,
  );
  const fill = nodes(pill).find((node) => node.props.className === "ringFill");
  assert.ok(fill);
  assert.equal(fill.props.d, "M 24 5 A 19 19 0 0 0 24 43");
  assert.equal(fill.props.strokeDasharray, "12 100");
  view.resize({ left: 56, right: 800, top: 0, bottom: 600 });
  assert.equal(placementOf(view.render()).left, 776);
  assert.equal(placementOf(view.render()).top, 276);
  const unmount = view.mountEffects();
  unmount();
  assert.equal(view.resizeCallbacks.size, 0);
  assert.equal(view.mutationCallbacks.size, 0);
});

test("dragging snaps to the nearest edge, preserves height, and suppresses the resulting click", () => {
  const view = sidebar({ status: SIGNED_IN_USAGE });
  const target = pointerTarget();
  let button = buttonOf(view.render());
  pointer(button, "onPointerDown", target, 1188, 420);
  pointer(button, "onPointerMove", target, 500, 300);
  let pill = view.render();
  assert.equal(placementOf(pill).left, 488);
  assert.equal(placementOf(pill).top, 276);
  assert.equal(pill?.props["data-dragging"], true);
  assert.equal(dialogOf(pill), undefined);
  button = buttonOf(pill);
  pointer(button, "onPointerUp", target, 500, 300);
  pill = view.render();
  assert.equal(placementOf(pill).left, 280);
  assert.equal(placementOf(pill).top, 276);
  assert.equal(pill?.props["data-edge"], "left");
  assert.equal(pill?.props["data-dragging"], false);
  assert.equal(
    nodes(pill).find((node) => node.props.className === "ringTrack")?.props.d,
    "M 0 5 A 19 19 0 0 1 0 43",
  );
  (buttonOf(pill).props.onClick as (event: unknown) => void)({ detail: 1 });
  assert.equal(dialogOf(view.render()), undefined);
  // Keyboard activation must still work after a drag.
  (buttonOf(view.render()).props.onClick as (event: unknown) => void)({ detail: 0 });
  assert.ok(dialogOf(view.render()));
});

test("zero usage has no filled arc and full usage fills the whole semicircle", () => {
  for (const percent of [0, 100]) {
    const view = sidebar({
      status: {
        ...SIGNED_IN_USAGE,
        usage: { credits: { percent } },
      },
    });
    const fill = nodes(view.render()).find((node) => node.props.className === "ringFill");
    if (percent === 0) assert.equal(fill, undefined);
    else assert.equal(fill?.props.strokeDasharray, "100 100");
  }
});

test("clicking outside dismisses pinned details and unmount clears pending hover timers", () => {
  const view = sidebar({ status: SIGNED_IN_USAGE });
  (buttonOf(view.render()).props.onClick as () => void)();
  assert.ok(dialogOf(view.render()));
  view.dismissOutside();
  assert.equal(dialogOf(view.render()), undefined);
  const button = buttonOf(view.render());
  (button.props.onPointerEnter as (event: unknown) => void)({ pointerType: "mouse" });
  (button.props.onPointerLeave as () => void)();
  assert.equal(view.timers.size, 1);
  const unmount = view.mountEffects();
  unmount();
  assert.equal(view.timers.size, 0);
});

test("pointer cancellation and capture loss both clamp and dock without opening details", () => {
  for (const end of ["onPointerCancel", "onLostPointerCapture"]) {
    const view = sidebar({ status: SIGNED_IN_USAGE });
    const target = pointerTarget();
    const button = buttonOf(view.render());
    pointer(button, "onPointerDown", target, 1188, 420);
    pointer(button, "onPointerMove", target, 2000, -100);
    const moving = view.render();
    assert.equal(placementOf(moving).left, 1176);
    assert.equal(placementOf(moving).top, 52);
    pointer(buttonOf(moving), end, target, 2000, -100);
    const docked = view.render();
    assert.equal(docked?.props["data-edge"], "right");
    assert.equal(docked?.props["data-dragging"], false);
    assert.equal(dialogOf(docked), undefined);
  }
});

test("small pointer movement remains a click and secondary pointers cannot drag", () => {
  const view = sidebar({ status: SIGNED_IN_USAGE });
  const target = pointerTarget();
  const button = buttonOf(view.render());
  (button.props.onPointerDown as (event: unknown) => void)({ button: 2, isPrimary: true });
  pointer(button, "onPointerMove", target, 0, 0);
  assert.equal(view.render()?.props["data-dragging"], false);
  pointer(button, "onPointerDown", target, 1188, 420);
  pointer(button, "onPointerMove", target, 1189, 421);
  pointer(button, "onPointerUp", target, 1189, 421);
  (button.props.onClick as () => void)();
  assert.ok(dialogOf(view.render()));
});

test("hover opens the existing details, crossing the gap keeps them open, and clicking pins them", () => {
  const view = sidebar({ status: SIGNED_IN_USAGE });
  let button = buttonOf(view.render());
  (button.props.onPointerEnter as (event: unknown) => void)({ pointerType: "touch" });
  assert.equal(dialogOf(view.render()), undefined);
  (button.props.onPointerEnter as (event: unknown) => void)({ pointerType: "mouse" });
  let dialog = dialogOf(view.render());
  assert.ok(dialog);
  assert.match(textContent(dialog), /SuperGrok/);
  (button.props.onPointerLeave as () => void)();
  assert.equal(view.timers.size, 1);
  (dialog.props.onPointerEnter as (event: unknown) => void)({ pointerType: "mouse" });
  assert.equal(view.timers.size, 0);
  (dialog.props.onPointerLeave as () => void)();
  view.flushHoverClose();
  assert.equal(dialogOf(view.render()), undefined);
  button = buttonOf(view.render());
  (button.props.onPointerEnter as (event: unknown) => void)({ pointerType: "mouse" });
  (button.props.onClick as () => void)();
  (button.props.onPointerLeave as () => void)();
  view.flushHoverClose();
  dialog = dialogOf(view.render());
  assert.ok(dialog);
  (buttonOf(view.render()).props.onClick as () => void)();
  assert.equal(dialogOf(view.render()), undefined);
});

test("open drawers and fullscreen right panels hide the floating control and details", () => {
  for (const reason of ["drawer", "fullscreen"] as const) {
    const view = sidebar({ status: SIGNED_IN_USAGE });
    (buttonOf(view.render()).props.onClick as () => void)();
    assert.ok(dialogOf(view.render()));
    view.hideContent(reason);
    const pill = view.render();
    assert.equal(placementOf(pill).visibility, "hidden");
    assert.equal(dialogOf(pill), undefined);
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
    value: { showSidebarUsage: true, signedIn: true, usage: { credits: { percent: 12 } } },
  });
  view.poll();
  await nextTurn();
  const reading = () =>
    nodes(view.render()).find((node) => node.type === "button")?.props["aria-label"];
  assert.equal(reading(), "Grok usage 12%");
  view.setReply({ ok: false });
  view.poll();
  await nextTurn();
  assert.equal(reading(), "Grok usage 12%");
  view.setFailure(new Error("Connection lost"));
  view.poll();
  await nextTurn();
  assert.equal(reading(), "Grok usage 12%");
  assert.ok(
    view.remoteCalls.every(
      (call) => call.path === "/api" && call.endpoint === "xaiSupergrok/status",
    ),
  );
  unmount();
  assert.equal(view.intervals.size, 0);

  const signedOut = sidebar({
    status: { showSidebarUsage: true, signedIn: true, usage: { credits: { percent: 12 } } },
  });
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
  resolve({
    ok: true,
    value: { showSidebarUsage: true, signedIn: true, usage: { credits: { percent: 12 } } },
  });
  await nextTurn();
  assert.equal(view.render(), null);
});
