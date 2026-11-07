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

interface SessionList {
  byId: Record<string, { id: string; retainedBy: { mainView?: number } }>;
}

interface ModelChoice {
  provider: string;
  model: string;
}

interface UsageProps {
  ctx: ClientContext;
  t: (key: string, vars?: Record<string, string>) => string;
  useSessions: <T>(selector: (state: SessionList) => T) => T;
  usePanelInfo: <T>(selector: (info: { activePanelId: string | null }) => T) => T;
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
  getSnapshot: () => {
    status: string;
    value?: { showSidebarUsage?: boolean; onlyShowUsageForGrok?: boolean };
    writable: boolean;
  };
  subscribe: (listener: () => void) => () => void;
  set: (field: string, value: boolean) => Promise<boolean>;
}

function sidebar(
  options: {
    status?: unknown;
    wide?: boolean;
    form?: PreferenceForm;
    reducedMotion?: boolean;
    animationsSupported?: boolean;
    sessionId?: string;
    selection?: ModelChoice | null;
    panelId?: string | null;
  } = {},
) {
  const componentStates = new Map<unknown, unknown[]>();
  const componentRefs = new Map<unknown, Array<{ current: unknown }>>();
  let states: unknown[] = [];
  let refs: Array<{ current: unknown }> = [];
  let stateIndex = 0;
  let refIndex = 0;
  let changed = false;
  type LayoutEffectState = { deps: unknown[]; cleanup: void | (() => void) };
  const componentLayouts = new Map<unknown, LayoutEffectState[]>();
  let layouts: LayoutEffectState[] = [];
  let layoutIndex = 0;
  const layoutEffects: Array<() => void> = [];
  const animations: Array<{
    target: string;
    frames: Array<Record<string, unknown>>;
    options: { duration: number; easing: string };
    cancelled: boolean;
  }> = [];
  const animate =
    (target: string) =>
    (frames: Array<Record<string, unknown>>, options: { duration: number; easing: string }) => {
      const record = { target, frames, options, cancelled: false };
      animations.push(record);
      return {
        cancel: () => {
          record.cancelled = true;
        },
      };
    };
  const motionListeners = new Set<(event: { matches: boolean }) => void>();
  const motion = {
    matches: options.reducedMotion === true,
    addEventListener: (_name: string, listener: (event: { matches: boolean }) => void) => {
      motionListeners.add(listener);
    },
    removeEventListener: (_name: string, listener: (event: { matches: boolean }) => void) => {
      motionListeners.delete(listener);
    },
  };
  const resizeCallbacks = new Set<() => void>();
  const mutationCallbacks = new Set<() => void>();
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
    animate: options.animationsSupported === false ? undefined : animate("root"),
    querySelector: (selector: string) => {
      assert.equal(selector, ".trigger");
      return { animate: options.animationsSupported === false ? undefined : animate("trigger") };
    },
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
  function scheduleLayoutEffect(effect: () => void | (() => void), deps: unknown[]) {
    const index = layoutIndex++;
    const previous = layouts[index];
    if (
      previous &&
      deps.length === previous.deps.length &&
      deps.every((dep, i) => Object.is(dep, previous.deps[i]))
    )
      return;
    const current = layouts;
    layoutEffects.push(() => {
      if (typeof previous?.cleanup === "function") previous.cleanup();
      current[index] = { deps, cleanup: effect() };
    });
  }
  let activeSessionId = options.sessionId;
  let activePanelId = options.panelId ?? null;
  const modelReads: string[] = [];
  const modelLoads: string[] = [];
  const modelSources = new Map<
    string,
    {
      state: { current: ModelChoice | null; pending: ModelChoice | null };
      listeners: Set<() => void>;
      directory: {
        store: { getSnapshot: () => unknown; subscribe: (listener: () => void) => () => void };
        load: () => Promise<unknown>;
      };
    }
  >();
  function modelSource(sessionId: string) {
    let source = modelSources.get(sessionId);
    if (!source) {
      const state = {
        current: sessionId === options.sessionId ? (options.selection ?? null) : null,
        pending: null,
      };
      const listeners = new Set<() => void>();
      const entry: NonNullable<ReturnType<typeof modelSources.get>> = {
        state,
        listeners,
        directory: {
          store: {
            getSnapshot: () => entry.state,
            subscribe: (listener: () => void) => {
              listeners.add(listener);
              return () => {
                listeners.delete(listener);
              };
            },
          },
          load: async () => {
            modelLoads.push(sessionId);
            return entry.state;
          },
        },
      };
      source = entry;
      modelSources.set(sessionId, source);
    }
    return source;
  }
  const usePanelInfo = <T>(selector: (info: { activePanelId: string | null }) => T): T =>
    selector({ activePanelId });
  const useSessions = <T>(selector: (state: SessionList) => T): T =>
    selector({
      byId:
        activeSessionId === undefined
          ? {}
          : { [activeSessionId]: { id: activeSessionId, retainedBy: { mainView: 1 } } },
    });
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
      useLayoutEffect: scheduleLayoutEffect,
      useRef: (initial: unknown) => {
        const index = refIndex++;
        return (refs[index] ??= { current: initial });
      },
      useCallback: (callback: unknown) => callback,
      useSyncExternalStore: (
        subscribe: (listener: () => void) => () => void,
        getSnapshot: () => unknown,
      ) => {
        scheduleLayoutEffect(() => subscribe(() => {}), [subscribe]);
        return getSnapshot();
      },
    },
    "react-dom": {
      createPortal: (node: UsageNode, target: unknown) => {
        assert.equal(target, body);
        return node;
      },
    },
    "@deepseek-ai/dsh-client-ui-primitives": {
      Switch: "switch",
      Tooltip: "tooltip",
      useAnchoredPosition: () => ({ left: 12, top: 24 }),
      useDismissOnOutsidePointer: (_root: unknown, open: boolean, dismiss: () => void) => {
        outsideDismiss = open ? dismiss : undefined;
      },
    },
  };
  const plugin = loadClient({
    document,
    window: {
      addEventListener: () => {},
      removeEventListener: () => {},
      matchMedia: () => motion,
      getComputedStyle: () => ({ borderTopColor: "rgb(70, 140, 240)" }),
    },
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
    modelDirectories: {
      directoryFor: (sessionId: string) => {
        modelReads.push(sessionId);
        return modelSource(sessionId).directory;
      },
    },
    get: () => assert.fail("Usage must use injected services and standard slot hooks"),
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
    layouts = componentLayouts.get(element.type) ?? [];
    componentLayouts.set(element.type, layouts);
    let result: UsageNode | null = null;
    const MAX_LAYOUT_PASSES = 5;
    for (let pass = 0; pass < MAX_LAYOUT_PASSES; pass++) {
      stateIndex = 0;
      refIndex = 0;
      layoutIndex = 0;
      changed = false;
      effects.length = 0;
      layoutEffects.length = 0;
      result = element.type(element.props);
      for (const node of nodes(result)) {
        const ref = node.props.ref as { current: unknown } | undefined;
        if (ref) ref.current = node.props["data-xai-usage-pill"] === "" ? root : {};
      }
      for (const effect of layoutEffects) effect();
      if (!changed) return result;
    }
    assert.fail("Layout did not settle");
  }
  const initialElement = renderSlot({
    t: translate,
    useSessions,
    usePanelInfo,
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
    animations,
    motionListeners,
    modelReads,
    modelLoads,
    modelSources,
    selectModel(selection: ModelChoice | null, sessionId = activeSessionId) {
      assert.ok(sessionId);
      const source = modelSource(sessionId);
      source.state = { current: selection, pending: null };
      for (const listener of source.listeners) listener();
    },
    submitModel(selection: ModelChoice) {
      assert.ok(activeSessionId);
      const source = modelSource(activeSessionId);
      source.state = { ...source.state, pending: selection };
      for (const listener of source.listeners) listener();
    },
    switchSession(sessionId: string | undefined) {
      activeSessionId = sessionId;
    },
    switchPanel(panelId: string | null) {
      activePanelId = panelId;
    },
    setReducedMotion(matches: boolean) {
      motion.matches = matches;
      for (const listener of motionListeners) listener({ matches });
    },
    dismissOutside() {
      assert.ok(outsideDismiss);
      outsideDismiss();
    },
    resize(next: typeof rect) {
      rect = next;
      for (const callback of resizeCallbacks) callback();
    },
    hideContent(reason: "drawer" | "fullscreen") {
      if (reason === "drawer") center.inert = true;
      else fullscreen = true;
      for (const callback of mutationCallbacks) callback();
    },
    render(wide = options.wide ?? true) {
      const element = renderSlot({
        t: translate,
        wide,
        useSessions,
        usePanelInfo,
      } as DetailProps) as unknown as UsageElement;
      assert.equal(element.props.ctx, ctx);
      return renderElement(element);
    },
    renderPreference(field = "showSidebarUsage") {
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
        (node) =>
          options.form !== undefined &&
          node.props.form === options.form &&
          node.props.field === field,
      );
      assert.ok(preference, "The bundle page must render the usage preference");
      return renderElement(preference as unknown as UsageElement);
    },
    mountEffects() {
      const cleanups = effects.map((effect) => effect());
      return () => {
        for (const cleanup of [...cleanups, ...layouts.map((layout) => layout.cleanup)])
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

test("the Grok-only switch saves independently through the plugin configuration form", async () => {
  let onlyGrok = false;
  const writes: Array<[string, boolean]> = [];
  const view = sidebar({
    form: {
      getSnapshot: () => ({
        status: "ready",
        writable: true,
        value: { showSidebarUsage: true, onlyShowUsageForGrok: onlyGrok },
      }),
      subscribe: () => () => {},
      set: async (field, value) => {
        writes.push([field, value]);
        onlyGrok = value;
        return true;
      },
    },
  });
  for (const next of [true, false]) {
    const control = nodes(view.renderPreference("onlyShowUsageForGrok")).find(
      (node) => node.type === "switch",
    );
    assert.ok(control);
    assert.equal(control.props.label, "onlyShowUsageForGrok");
    assert.equal(control.props.checked, !next);
    (control.props.onChange as (next: boolean) => void)(next);
    await nextTurn();
    assert.equal(
      nodes(view.renderPreference("onlyShowUsageForGrok")).find((node) => node.type === "switch")
        ?.props.checked,
      next,
    );
    assert.equal(
      nodes(view.renderPreference()).find((node) => node.type === "switch")?.props.checked,
      true,
    );
  }
  assert.deepEqual(writes, [
    ["onlyShowUsageForGrok", true],
    ["onlyShowUsageForGrok", false],
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
    for (const field of ["showSidebarUsage", "onlyShowUsageForGrok"]) {
      const control = nodes(view.renderPreference(field)).find((node) => node.type === "switch");
      assert.ok(control);
      assert.equal(control.props.disabled, true);
    }
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

test("usage registers in the shell overlay without resolving session models by default", () => {
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
  assert.equal(textContent(pill), "88%");
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

test("the collapsed sidebar keeps the ring percentage and accessible label", () => {
  const view = sidebar({
    status: { showSidebarUsage: true, signedIn: true, usage: { credits: { percent: 0 } } },
  });
  const pill = view.render(false);
  assert.ok(pill);
  assert.equal(pill.props["data-edge"], "right");
  assert.equal(textContent(pill), "100%");
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
    assert.equal(meter.props["aria-valuenow"], 88);
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

function assertPixels(actual: number, expected: number) {
  const PIXEL_TOLERANCE = 0.001;
  assert.ok(
    Math.abs(actual - expected) < PIXEL_TOLERANCE,
    `${actual} must be close to ${expected}`,
  );
}

function dialogOf(node: UsageNode | null) {
  return nodes(node).find((entry) => entry.props.role === "dialog");
}

test("the entry has a rectangular outline with rounded corners away from the dock edge", () => {
  const view = sidebar({ status: SIGNED_IN_USAGE });
  const pill = view.render();
  const unmount = view.mountEffects();
  const css = [...view.styles.values()][0]?.textContent;
  assert.ok(css);
  const triggerRule = css.match(/\[data-xai-usage-pill\] \.trigger\{([^}]+)\}/)?.[1];
  assert.ok(triggerRule);
  assert.match(triggerRule, /(?:^|;)corner-shape:round(?:;|$)/);
  const svg = nodes(pill).find((node) => node.type === "svg");
  assert.ok(svg);
  assert.equal(Number(svg.props.height), Number(svg.props.width));
  assert.match(triggerRule, /(?:^|;)border-radius:12\.8px(?:;|$)/);
  assert.match(triggerRule, /(?:^|;)border:0\.8px solid/);
  assert.equal(svg.props.width, 38.4);
  assert.equal(svg.props.height, 38.4);
  assert.equal(svg.props.viewBox, "0 0 48 48");
  assert.match(
    css,
    /\[data-xai-usage-pill\]\[data-edge=left\]:not\(\[data-dragging=true\]\) \.trigger\{border-radius:0 12\.8px 12\.8px 0;border-left-color:transparent\}/,
  );
  assert.match(
    css,
    /\[data-xai-usage-pill\]\[data-edge=right\]:not\(\[data-dragging=true\]\) \.trigger\{border-radius:12\.8px 0 0 12\.8px;border-right-color:transparent\}/,
  );
  assert.match(triggerRule, /(?:^|;)--dsw-elevation-stroke-color:transparent(?:;|$)/);
  assert.match(css, /\[data-xai-usage-pill\]\{[^}]*width:50px;height:40px/);
  assert.match(css, /\[data-xai-usage-panel\]\{[^}]*width:min\(264px,calc\(100vw - 24px\)\)/);
  unmount();
});

test("hover and open feedback affect only the outer glow, not the badge interior", () => {
  const view = sidebar({ status: SIGNED_IN_USAGE });
  view.render();
  const unmount = view.mountEffects();
  const css = [...view.styles.values()][0]?.textContent;
  assert.ok(css);
  const hoverRule = css.match(
    /\[data-xai-usage-pill\] \.trigger\[aria-expanded=true\],\[data-xai-usage-pill\] \.trigger:hover\{([^}]+)\}/,
  )?.[1];
  assert.ok(hoverRule);
  assert.match(hoverRule, /^box-shadow:/);
  assert.match(hoverRule, /var\(--dsw-static-blue-450\)/);
  assert.match(hoverRule, /var\(--dsw-static-blue-300\)/);
  assert.match(hoverRule, /0 0 9\.6px/);
  assert.match(hoverRule, /0 0 19\.2px/);
  assert.doesNotMatch(hoverRule, /(?:^|;)(?:background(?:-color)?|color|border[^:]*):|inset/);
  assert.match(
    css,
    /@media \(prefers-reduced-motion:reduce\)\{\[data-xai-usage-pill\] \.trigger\{transition:none\}\}/,
  );
  unmount();
});

test("the icon draws a full percentage ring and follows the content edge on resize", () => {
  const view = sidebar({ status: SIGNED_IN_USAGE });
  const pill = view.render();
  assertPixels(placementOf(pill).left, 1150);
  assertPixels(placementOf(pill).top, 400);
  assert.equal(textContent(pill), "88%");
  assert.equal(nodes(pill).filter((node) => node.type === "circle").length, 2);
  const percent = nodes(pill).find((node) => node.props.className === "ringPercent");
  assert.ok(percent);
  assert.equal(percent.props.x, 24);
  assert.equal(percent.props.y, 24);
  assert.equal(percent.props.textAnchor, "middle");
  const fill = nodes(pill).find((node) => node.props.className === "ringFill");
  assert.ok(fill);
  assert.equal(fill.type, "circle");
  assert.equal(fill.props.cx, 24);
  assert.equal(fill.props.cy, 24);
  assert.equal(fill.props.r, 19);
  assert.equal(fill.props.transform, "rotate(-90 24 24)");
  assert.equal(fill.props.style, undefined);
  assert.equal(
    nodes(pill).find((node) => node.type === "linearGradient"),
    undefined,
  );
  assert.equal(fill.props.strokeDasharray, "88 12");
  assert.equal(fill.props.strokeDashoffset, 88);
  view.resize({ left: 56, right: 800, top: 0, bottom: 600 });
  assertPixels(placementOf(view.render()).left, 750);
  assertPixels(placementOf(view.render()).top, 280);
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
  assertPixels(placementOf(pill).left, 462);
  assertPixels(placementOf(pill).top, 280);
  assert.equal(pill?.props["data-dragging"], true);
  assert.equal(nodes(pill).find((node) => node.type === "tooltip")?.props.disabled, true);
  assert.equal(dialogOf(pill), undefined);
  button = buttonOf(pill);
  pointer(button, "onPointerUp", target, 500, 300);
  pill = view.render();
  assert.equal(placementOf(pill).left, 280);
  assertPixels(placementOf(pill).top, 280);
  assert.equal(pill?.props["data-edge"], "left");
  assert.equal(pill?.props["data-dragging"], false);
  const tooltip = nodes(pill).find((node) => node.type === "tooltip");
  assert.equal(tooltip?.props.disabled, false);
  assert.equal(tooltip?.props.side, "right");
  const track = nodes(pill).find((node) => node.props.className === "ringTrack");
  assert.ok(track);
  assert.equal(track.type, "circle");
  assert.equal(track.props.cx, 24);
  assert.equal(track.props.r, 19);
  (buttonOf(pill).props.onClick as (event: unknown) => void)({ detail: 1 });
  assert.equal(dialogOf(view.render()), undefined);
  // Keyboard activation must still work after a drag.
  (buttonOf(view.render()).props.onClick as (event: unknown) => void)({ detail: 0 });
  assert.ok(dialogOf(view.render()));
});

test("docking travels from the release point and plays a mirrored jelly deformation", () => {
  for (const { x, edge, translationX, corners, border } of [
    {
      x: 500,
      edge: "left",
      translationX: 182,
      corners: "0 12.8px 12.8px 0",
      border: "borderLeftColor",
    },
    {
      x: 1000,
      edge: "right",
      translationX: -188,
      corners: "12.8px 0 0 12.8px",
      border: "borderRightColor",
    },
  ]) {
    const view = sidebar({ status: SIGNED_IN_USAGE });
    const target = pointerTarget();
    const button = buttonOf(view.render());
    pointer(button, "onPointerDown", target, 1188, 420);
    pointer(button, "onPointerMove", target, x, 300);
    const moving = view.render();
    assert.equal(moving?.props["data-dragging"], true);
    assert.equal(view.animations.length, 0);
    pointer(buttonOf(moving), "onPointerUp", target, x, 300);
    assert.equal(view.render()?.props["data-edge"], edge);
    assert.equal(view.animations.length, 2);
    const [travel, jelly] = view.animations;
    assert.equal(travel.target, "root");
    const translation = String(travel.frames[0].transform).match(
      /^translate\(([^,]+)px,([^,]+)px\)$/,
    );
    assert.ok(translation);
    assertPixels(Number(translation[1]), translationX);
    assertPixels(Number(translation[2]), 0);
    assert.equal(travel.frames.at(-1)?.transform, "translate(0px,0px)");
    assert.equal(jelly.target, "trigger");
    assert.ok(jelly.options.duration > travel.options.duration);
    assert.equal(jelly.frames[0].borderRadius, "12.8px");
    assert.equal(jelly.frames[0][border], "rgb(70, 140, 240)");
    assert.equal(jelly.frames[1].transform, "scale(0.88,1.08)");
    assert.equal(jelly.frames[2].transform, "scale(1.06,0.96)");
    assert.equal(jelly.frames.at(-1)?.transform, "scale(1,1)");
    assert.equal(jelly.frames.at(-1)?.borderRadius, corners);
    assert.equal(jelly.frames.at(-1)?.[border], "transparent");
    assert.ok(jelly.frames.every((frame) => frame.transformOrigin === `${edge} center`));
    view.render();
    assert.equal(view.animations.length, 2);
    assert.ok(view.animations.every((animation) => !animation.cancelled));
    const unmount = view.mountEffects();
    unmount();
    assert.ok(view.animations.every((animation) => animation.cancelled));
    assert.equal(view.motionListeners.size, 0);
  }
});

test("reduced motion and browsers without animation support still dock without animation", () => {
  for (const options of [{ reducedMotion: true }, { animationsSupported: false }]) {
    const view = sidebar({ status: SIGNED_IN_USAGE, ...options });
    const target = pointerTarget();
    const button = buttonOf(view.render());
    pointer(button, "onPointerDown", target, 1188, 420);
    pointer(button, "onPointerMove", target, 500, 300);
    pointer(buttonOf(view.render()), "onPointerUp", target, 500, 300);
    const docked = view.render();
    assert.equal(docked?.props["data-edge"], "left");
    assert.equal(docked?.props["data-dragging"], false);
    assert.equal(placementOf(docked).left, 280);
    assert.equal(view.animations.length, 0);
  }
});

test("a new drag, reduced motion, and hidden content cancel active docking animations", () => {
  for (const interruption of ["drag", "motion", "hidden"]) {
    const view = sidebar({ status: SIGNED_IN_USAGE });
    const target = pointerTarget();
    const button = buttonOf(view.render());
    pointer(button, "onPointerDown", target, 1188, 420);
    pointer(button, "onPointerMove", target, 500, 300);
    pointer(buttonOf(view.render()), "onPointerUp", target, 500, 300);
    const docked = view.render();
    assert.equal(view.animations.length, 2);
    assert.ok(view.animations.every((animation) => !animation.cancelled));
    if (interruption === "drag") pointer(buttonOf(docked), "onPointerDown", target, 292, 300);
    else if (interruption === "motion") view.setReducedMotion(true);
    else {
      view.hideContent("fullscreen");
      view.render();
    }
    assert.ok(view.animations.every((animation) => animation.cancelled));
  }
});

test("Grok-only visibility matches the subscription route, not model display names", () => {
  for (const selection of [
    { provider: "xai-supergrok", model: "grok-4" },
    { provider: "xai", model: "grok-4" },
    { provider: "openrouter", model: "x-ai/grok-4" },
    { provider: "deepseek", model: "deepseek-chat" },
    null,
  ]) {
    for (const loading of [false, true]) {
      const view = sidebar({
        sessionId: "main",
        selection,
        status: {
          ...SIGNED_IN_USAGE,
          onlyShowUsageForGrok: true,
          usage: loading ? undefined : SIGNED_IN_USAGE.usage,
          usagePending: loading,
        },
      });
      assert.equal(view.render() !== null, selection?.provider === "xai-supergrok");
    }
  }
  assert.equal(
    sidebar({ status: { ...SIGNED_IN_USAGE, onlyShowUsageForGrok: true } }).render(),
    null,
  );
});

test("Grok-only mode hides the badge on every non-conversation page, including loading", () => {
  for (const panelId of ["plugins", "settings", "models", "custom-page"]) {
    for (const loading of [false, true]) {
      const view = sidebar({
        panelId,
        sessionId: "main",
        selection: { provider: "xai-supergrok", model: "grok-4" },
        status: {
          ...SIGNED_IN_USAGE,
          onlyShowUsageForGrok: true,
          usage: loading ? undefined : SIGNED_IN_USAGE.usage,
          usagePending: loading,
        },
      });
      assert.equal(view.render(), null);
      assert.equal(view.modelReads.length, 0);
    }
  }
});

test("leaving the conversation closes usage details and returning does not reopen them", async () => {
  const view = sidebar({
    sessionId: "main",
    selection: { provider: "xai-supergrok", model: "grok-4" },
    status: { ...SIGNED_IN_USAGE, onlyShowUsageForGrok: true },
  });
  (buttonOf(view.render()).props.onClick as () => void)();
  assert.ok(dialogOf(view.render()));
  view.switchPanel("plugins");
  assert.equal(view.render(), null);
  assert.equal(view.modelSources.get("main")?.listeners.size, 0);
  const unmount = view.mountEffects();
  await nextTurn();
  view.switchPanel(null);
  assert.ok(view.render());
  assert.equal(dialogOf(view.render()), undefined);
  assert.equal(view.modelSources.get("main")?.listeners.size, 1);
  unmount();
});

test("model changes on another page cannot reveal the badge", () => {
  const view = sidebar({
    panelId: "plugins",
    sessionId: "main",
    selection: { provider: "deepseek", model: "deepseek-chat" },
    status: { ...SIGNED_IN_USAGE, onlyShowUsageForGrok: true },
  });
  assert.equal(view.render(), null);
  view.selectModel({ provider: "xai-supergrok", model: "grok-4" });
  assert.equal(view.render(), null);
  view.switchPanel(null);
  assert.ok(view.render());
  view.switchPanel("custom-page");
  assert.equal(view.render(), null);
});

test("disabling Grok-only mode preserves visibility on other pages", () => {
  for (const onlyShowUsageForGrok of [undefined, false]) {
    const view = sidebar({
      panelId: "plugins",
      status: { ...SIGNED_IN_USAGE, onlyShowUsageForGrok },
    });
    assert.ok(view.render());
    assert.equal(view.modelReads.length, 0);
  }
});

test("the default visibility setting does not resolve models or require a session", () => {
  for (const onlyShowUsageForGrok of [undefined, false]) {
    const view = sidebar({
      sessionId: "main",
      selection: { provider: "deepseek", model: "deepseek-chat" },
      status: { ...SIGNED_IN_USAGE, onlyShowUsageForGrok },
    });
    assert.ok(view.render());
    assert.equal(view.modelReads.length, 0);
  }
});

test("confirmed model changes hide open details without waiting for usage polling", async () => {
  const view = sidebar({
    sessionId: "main",
    selection: { provider: "deepseek", model: "deepseek-chat" },
    status: { ...SIGNED_IN_USAGE, onlyShowUsageForGrok: true },
  });
  assert.equal(view.render(), null);
  view.selectModel({ provider: "xai-supergrok", model: "grok-4" });
  (buttonOf(view.render()).props.onClick as () => void)();
  assert.ok(dialogOf(view.render()));
  view.submitModel({ provider: "deepseek", model: "deepseek-chat" });
  assert.ok(dialogOf(view.render()), "A pending selection must not hide the confirmed Grok route");
  view.selectModel({ provider: "deepseek", model: "deepseek-chat" });
  assert.equal(view.render(), null);
  assert.equal(view.remoteCalls.length, 0);
  const unmount = view.mountEffects();
  await nextTurn();
  view.selectModel({ provider: "xai-supergrok", model: "grok-4" });
  assert.ok(view.render());
  assert.equal(dialogOf(view.render()), undefined);
  unmount();
  assert.equal(view.modelSources.get("main")?.listeners.size, 0);
});

test("session switching replaces the selected-model subscription and ignores background models", () => {
  const view = sidebar({
    sessionId: "first",
    selection: { provider: "xai-supergrok", model: "grok-4" },
    status: { ...SIGNED_IN_USAGE, onlyShowUsageForGrok: true },
  });
  assert.ok(view.render());
  assert.equal(view.modelSources.get("first")?.listeners.size, 1);
  view.selectModel({ provider: "deepseek", model: "deepseek-chat" }, "second");
  view.switchSession("second");
  assert.equal(view.render(), null);
  assert.equal(view.modelSources.get("first")?.listeners.size, 0);
  assert.equal(view.modelSources.get("second")?.listeners.size, 1);
  view.selectModel({ provider: "xai-supergrok", model: "grok-3" }, "first");
  assert.equal(view.render(), null);
  view.selectModel({ provider: "xai-supergrok", model: "grok-4" }, "second");
  assert.ok(view.render());
  view.switchSession(undefined);
  assert.equal(view.render(), null);
  assert.equal(view.modelSources.get("second")?.listeners.size, 0);
});

test("status updates apply the Grok-only setting without restarting the client", async () => {
  const view = sidebar({
    sessionId: "main",
    selection: { provider: "deepseek", model: "deepseek-chat" },
    status: SIGNED_IN_USAGE,
  });
  assert.ok(view.render());
  const unmount = view.mountEffects();
  await nextTurn();
  view.setReply({ ok: true, value: { ...SIGNED_IN_USAGE, onlyShowUsageForGrok: true } });
  view.poll();
  await nextTurn();
  assert.equal(view.render(), null);
  assert.equal(view.modelSources.get("main")?.listeners.size, 1);
  view.setReply({ ok: true, value: SIGNED_IN_USAGE });
  view.poll();
  await nextTurn();
  assert.ok(view.render());
  assert.equal(view.modelSources.get("main")?.listeners.size, 0);
  unmount();
});

test("the model directory loads for the current session and releases subscriptions on unmount", () => {
  const view = sidebar({
    sessionId: "main",
    selection: { provider: "xai-supergrok", model: "grok-4" },
    status: { ...SIGNED_IN_USAGE, onlyShowUsageForGrok: true },
  });
  assert.ok(view.render());
  const unmount = view.mountEffects();
  assert.deepEqual(view.modelLoads, ["main"]);
  unmount();
  assert.equal(view.modelSources.get("main")?.listeners.size, 0);
});

test("low quota paints the ring and percentage with the host error-state color", () => {
  const view = sidebar({
    status: { ...SIGNED_IN_USAGE, usage: { credits: { percent: 88 } } },
  });
  const pill = view.render();
  assert.ok(nodes(pill).some((node) => node.props.className === "ringFill low"));
  assert.ok(nodes(pill).some((node) => node.props.className === "ringPercent low"));
  const unmount = view.mountEffects();
  try {
    const css = [...view.styles.values()][0]?.textContent;
    assert.ok(css);
    const ringRule = css.match(/\[data-xai-usage-pill\] \.ringFill\.low\{([^}]+)\}/)?.[1];
    const percentRule = css.match(/\[data-xai-usage-pill\] \.ringPercent\.low\{([^}]+)\}/)?.[1];
    assert.ok(ringRule);
    assert.ok(percentRule);
    assert.match(ringRule, /(?:^|;)stroke:var\(--dsw-alias-state-error-primary\)(?:;|$)/);
    assert.match(percentRule, /(?:^|;)fill:var\(--dsw-alias-state-error-primary\)(?:;|$)/);
  } finally {
    unmount();
  }
});

test("the arc and detail bar count down remaining quota while usage labels stay unchanged", () => {
  const readings = [
    { used: 0, remaining: 100, label: "Grok usage 0%" },
    { used: 85, remaining: 15, label: "Grok usage 85%" },
    { used: 86, remaining: 14, label: "Grok usage 86%" },
    { used: 86.5, remaining: 14, label: "Grok usage 87%" },
    { used: 100, remaining: 0, label: "Grok usage 100%" },
    { used: -20, remaining: 100, label: "Grok usage 0%" },
    { used: 120, remaining: 0, label: "Grok usage 100%" },
  ];
  for (const { used, remaining, label } of readings) {
    const view = sidebar({
      status: {
        ...SIGNED_IN_USAGE,
        usage: { credits: { percent: used } },
      },
    });
    const pill = view.render();
    const fill = nodes(pill).find((node) => String(node.props.className).includes("ringFill"));
    const percent = nodes(pill).find((node) =>
      String(node.props.className).includes("ringPercent"),
    );
    const low = remaining < 15;
    assert.equal(percent?.props.className, low ? "ringPercent low" : "ringPercent");
    if (remaining === 0) assert.equal(fill, undefined);
    else {
      assert.equal(fill?.props.className, low ? "ringFill low" : "ringFill");
      assert.equal(fill?.props.strokeDasharray, `${remaining} ${100 - remaining}`);
      assert.equal(fill?.props.strokeDashoffset, remaining);
    }
    assert.equal(nodes(pill).find((node) => node.type === "tooltip")?.props.label, label);
    assert.equal(textContent(pill), `${remaining}%`);
    (buttonOf(pill).props.onClick as () => void)();
    const dialog = dialogOf(view.render());
    assert.ok(dialog);
    const meter = nodes(dialog).find((node) => node.props.role === "meter");
    assert.ok(meter);
    assert.equal(meter.props["aria-valuenow"], remaining);
    assert.equal(meter.props["aria-label"], "remainingLabel");
    const segment = nodes(dialog).find((node) => node.props.className === "segment");
    if (remaining === 0) assert.equal(segment, undefined);
    else {
      assert.ok(segment);
      assert.equal((segment.props.style as { width: string }).width, `${remaining}%`);
    }
    assert.equal(dialog.props["aria-label"], label);
  }
});

test("clicking outside dismisses details and restores the hover tooltip", () => {
  const view = sidebar({ status: SIGNED_IN_USAGE });
  (buttonOf(view.render()).props.onClick as () => void)();
  assert.ok(dialogOf(view.render()));
  view.dismissOutside();
  assert.equal(dialogOf(view.render()), undefined);
  assert.equal(nodes(view.render()).find((node) => node.type === "tooltip")?.props.disabled, false);
});

test("pointer cancellation and capture loss both clamp and dock without opening details", () => {
  for (const end of ["onPointerCancel", "onLostPointerCapture"]) {
    const view = sidebar({ status: SIGNED_IN_USAGE });
    const target = pointerTarget();
    const button = buttonOf(view.render());
    pointer(button, "onPointerDown", target, 1188, 420);
    pointer(button, "onPointerMove", target, 2000, -100);
    const moving = view.render();
    assertPixels(placementOf(moving).left, 1150);
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
  assert.equal(view.animations.length, 0);
});

test("hover uses the usage tooltip while details open only on click", () => {
  const view = sidebar({ status: SIGNED_IN_USAGE });
  const pill = view.render();
  const tooltip = nodes(pill).find((node) => node.type === "tooltip");
  assert.ok(tooltip);
  assert.equal(tooltip.props.label, "Grok usage 12%");
  assert.equal(tooltip.props.disabled, false);
  assert.equal(tooltip.props.portal, true);
  assert.equal(tooltip.props.side, "left");
  assert.equal(textContent(pill), "88%");
  const button = buttonOf(pill);
  assert.equal(button.props.onPointerEnter, undefined);
  assert.equal(button.props.onPointerLeave, undefined);
  assert.equal(dialogOf(pill), undefined);
  (button.props.onClick as () => void)();
  const opened = view.render();
  const dialog = dialogOf(opened);
  assert.ok(dialog);
  assert.match(textContent(dialog), /SuperGrok/);
  assert.equal(nodes(opened).find((node) => node.type === "tooltip")?.props.disabled, true);
  assert.equal(dialog.props.onPointerLeave, undefined);
  (buttonOf(opened).props.onClick as () => void)();
  const closed = view.render();
  assert.equal(dialogOf(closed), undefined);
  assert.equal(nodes(closed).find((node) => node.type === "tooltip")?.props.disabled, false);
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
