// ABOUTME: Exercise diagnostics from authenticated IDE sockets through the real dsh HTTP stream.
// ABOUTME: Verify one-composer delivery, target changes, cancellation, and workspace isolation.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Context } from "@deepseek-ai/cordis";
import { AgentRegistry } from "@deepseek-ai/dsh-agent";
import { WebServer } from "@deepseek-ai/dsh-host-webserver";
import { SessionStore } from "@deepseek-ai/dsh-session";
import * as plugin from "../../src/dsh/index.js";
import { DIAGNOSTIC_EVENTS_PATH } from "../../src/dsh/diagnostics-stream.js";
import { ideLockId } from "../../src/shared/ide.js";
import { createLock, writeLock } from "../../src/shared/lock.js";
import type { DiagnosticContext } from "../../src/shared/protocol.js";
import { IdeServer } from "../../src/shared/server.js";
import { followSelection } from "../../src/shared/watch.js";

const TOKEN = "d".repeat(64);
const MAX_AGE_MS = 60_000;
const cleanups: Array<() => void | Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

async function harness() {
  const root = await mkdtemp(join(tmpdir(), "dsh-diagnostics-"));
  cleanups.push(() => rm(root, { recursive: true, force: true }));
  const cwd = join(root, "app");
  const server = new IdeServer(TOKEN, () => undefined);
  const port = await server.start();
  cleanups.push(() => server.stop());
  const lock = createLock(port, TOKEN, [cwd]);
  await writeLock(join(root, "vscode.lock"), lock);
  const ctx = new Context();
  cleanups.push(async () => {
    await ctx.fiber.dispose();
  });
  await ctx.plugin(SessionStore);
  await ctx.plugin(AgentRegistry);
  await ctx.plugin(WebServer, { host: "127.0.0.1", port: 0 });
  let authorized = true;
  await ctx.plugin({
    name: "diagnostic-test-authorization",
    apply(scope: Context) {
      scope.provide("connection", { requestRejection: () => (authorized ? undefined : 401) });
    },
  });
  const fiber = await ctx.plugin(plugin, { lockDir: root });
  const session = ctx.sessions.create(undefined, { meta: { cwd } });
  const origin = ctx.webServer.getOrigin();
  const endpoint = `${origin}${DIAGNOSTIC_EVENTS_PATH}?session=${encodeURIComponent(session.id)}`;
  const context: DiagnosticContext = {
    source: "vscode",
    filePath: join(cwd, "example.ts"),
    workspaceFolder: cwd,
    documentVersion: 1,
    diagnostics: [
      {
        severity: "warning",
        message: "Unused variable.",
        source: "ts",
        code: 6133,
        range: { start: { line: 0, character: 6 }, end: { line: 0, character: 11 } },
        selectedText: "value",
        contextLines: [{ line: 0, text: "const value = 1;" }],
      },
    ],
  };
  async function open(url = endpoint) {
    const response = await fetch(url);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    if (!response.body) throw new Error("missing diagnostic stream");
    const reader = response.body.getReader();
    cleanups.push(async () => {
      await reader.cancel();
    });
    await readUntil(reader, '"type":"ready"');
    return reader;
  }
  async function choose(target: object) {
    const result = await fetch(
      `${origin}/ide-selection/target?session=${encodeURIComponent(session.id)}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(target),
      },
    );
    expect(result.status).toBe(200);
  }
  return {
    root,
    cwd,
    ctx,
    fiber,
    session,
    endpoint,
    server,
    context,
    lock,
    open,
    choose,
    authorize(value: boolean) {
      authorized = value;
    },
  };
}

async function readUntil(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  expected: string,
): Promise<string> {
  let text = "";
  const decoder = new TextDecoder();
  while (!text.includes(expected)) {
    const chunk = await reader.read();
    if (chunk.done) throw new Error(`stream ended before ${expected}`);
    text += decoder.decode(chunk.value, { stream: true });
  }
  return text;
}

describe("diagnostic input stream", () => {
  it("authorizes the route and sends formatted context without an agent turn", async () => {
    const h = await harness();
    h.authorize(false);
    expect((await fetch(h.endpoint)).status).toBe(401);
    h.authorize(true);
    expect((await fetch(h.endpoint.split("?")[0]!)).status).toBe(400);
    expect((await fetch(h.endpoint, { method: "POST" })).status).toBe(405);
    expect(h.server.sendDiagnostics(h.context)).toBe(false);
    const reader = await h.open();
    await vi.waitFor(() => expect(h.server.diagnosticClientCount).toBe(1));

    expect(h.server.sendDiagnostics(h.context)).toBe(true);
    const text = await readUntil(reader, '"type":"diagnostic"');
    expect(text).toContain("warning [ts 6133] at 1:7-1:12: Unused variable.");
    expect(text).toContain("const value = 1;");
    expect(h.ctx.agents.get(h.session.id)).toBeUndefined();
    expect(h.server.sendDiagnostics({ ...h.context, filePath: join(h.root, "outside.ts") })).toBe(
      false,
    );
  });

  it("delivers to only one composer, never an ordinary status watcher, and does not replay", async () => {
    const h = await harness();
    const lifetime = new AbortController();
    cleanups.push(() => lifetime.abort());
    followSelection({
      cwd: h.cwd,
      lockDir: h.root,
      maxAgeMs: MAX_AGE_MS,
      signal: lifetime.signal,
      onUpdate: () => undefined,
    });
    const first = await h.open();
    await vi.waitFor(() => expect(h.server.diagnosticClientCount).toBe(1));
    const other = h.ctx.sessions.create(undefined, { meta: { cwd: h.cwd } });
    const second = await h.open(
      h.endpoint.replace(encodeURIComponent(h.session.id), encodeURIComponent(other.id)),
    );
    await vi.waitFor(() => expect(h.server.diagnosticClientCount).toBe(2));
    expect(h.server.sendDiagnostics(h.context)).toBe(true);
    const firstText = await readUntil(first, '"type":"diagnostic"');
    expect(firstText).toContain("Unused variable.");
    await first.cancel();
    await vi.waitFor(() => expect(h.server.diagnosticClientCount).toBe(1));
    const next = {
      ...h.context,
      diagnostics: [{ ...h.context.diagnostics[0]!, message: "Second action." }],
    };
    expect(h.server.sendDiagnostics(next)).toBe(true);
    const secondText = await readUntil(second, '"type":"diagnostic"');
    expect(secondText).toContain("Second action.");
    expect(secondText).not.toContain("Unused variable.");
  });

  it("follows manual and disabled targets, and tears down its route on unload", async () => {
    const h = await harness();
    const nested = join(h.cwd, "nested");
    const other = new IdeServer(TOKEN, () => undefined);
    const port = await other.start();
    cleanups.push(() => other.stop());
    const otherLock = createLock(port, TOKEN, [nested]);
    await writeLock(join(h.root, "nested.lock"), otherLock);
    const reader = await h.open();
    await vi.waitFor(() => expect(h.server.diagnosticClientCount).toBe(1));
    await h.choose({ kind: "manual", ideId: ideLockId(otherLock) });
    await vi.waitFor(() => {
      expect(h.server.diagnosticClientCount).toBe(0);
      expect(other.diagnosticClientCount).toBe(1);
    });
    expect(h.server.sendDiagnostics(h.context)).toBe(false);
    expect(
      other.sendDiagnostics({
        ...h.context,
        filePath: join(nested, "file.ts"),
        workspaceFolder: nested,
      }),
    ).toBe(true);
    await readUntil(reader, '"type":"diagnostic"');
    await h.choose({ kind: "off" });
    await vi.waitFor(() => expect(other.diagnosticClientCount).toBe(0));
    expect(other.sendDiagnostics(h.context)).toBe(false);
    await h.fiber.dispose();
    expect((await fetch(h.endpoint)).status).toBe(404);
  });
});
