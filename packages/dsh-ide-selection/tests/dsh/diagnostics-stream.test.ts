// ABOUTME: Exercise classified diagnostic actions over the shared authenticated IDE event stream.
// ABOUTME: Verify pooled sockets, one-composer delivery, cancellation, targets, and workspace isolation.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Context } from "@deepseek-ai/cordis";
import { AgentRegistry } from "@deepseek-ai/dsh-agent";
import { SessionProjectionRegistry } from "@deepseek-ai/dsh-session-projection";
import { WebServer } from "@deepseek-ai/dsh-host-webserver";
import { SessionStore } from "@deepseek-ai/dsh-session";
import * as plugin from "../../src/dsh/index.js";
import { SELECTION_EVENTS_PATH, type IdeEvent } from "../../src/dsh/status-stream.js";
import type { DiagnosticInputEvent } from "../../src/dsh/diagnostics-stream.js";
import { ideLockId } from "../../src/shared/ide.js";
import { createLock, writeLock } from "../../src/shared/lock.js";
import type { DiagnosticContext } from "../../src/shared/protocol.js";
import { IdeServer } from "../../src/shared/server.js";

const TOKEN = "d".repeat(64);
const WAIT_MS = 2_000;
const cleanups: Array<() => void | Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

/** Parse complete SSE frames, including split/coalesced chunks, and classify rather than text-match. */
function readEvents(reader: ReadableStreamDefaultReader<Uint8Array>) {
  const events: IdeEvent[] = [];
  const decoder = new TextDecoder();
  let pending = "";
  let failure: unknown;
  let ended = false;
  const done = (async () => {
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) {
          ended = true;
          break;
        }
        pending += decoder.decode(chunk.value, { stream: true });
        let boundary: number;
        while ((boundary = pending.indexOf("\n\n")) >= 0) {
          const frame = pending.slice(0, boundary);
          pending = pending.slice(boundary + 2);
          if (!frame.startsWith("data: ")) continue;
          const event: IdeEvent = JSON.parse(frame.slice("data: ".length));
          if (event.type !== "status" && event.type !== "diagnostic")
            throw new Error(`unclassified IDE event: ${frame}`);
          events.push(event);
        }
      }
    } catch (error) {
      if (!(error instanceof Error && error.name === "AbortError")) failure = error;
    }
  })();
  return {
    events,
    ended: () => ended,
    diagnostics: () =>
      events.filter((event): event is DiagnosticInputEvent => event.type === "diagnostic"),
    async waitForDiagnostic(count: number) {
      await vi.waitFor(
        () => {
          if (failure) throw failure;
          expect(this.diagnostics()).toHaveLength(count);
        },
        { timeout: WAIT_MS },
      );
      return this.diagnostics()[count - 1]!;
    },
    async close() {
      await reader.cancel().catch(() => undefined);
      await done;
      if (failure) throw failure;
    },
  };
}

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
  await ctx.plugin(SessionProjectionRegistry);
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
  const endpointFor = (id: string) =>
    `${origin}${SELECTION_EVENTS_PATH}?session=${encodeURIComponent(id)}`;
  const endpoint = endpointFor(session.id);
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
  async function open(id = session.id) {
    const controller = new AbortController();
    const response = await fetch(endpointFor(id), { signal: controller.signal });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    if (!response.body) throw new Error("missing IDE event stream");
    const stream = readEvents(response.body.getReader());
    cleanups.push(() => stream.close());
    await vi.waitFor(() =>
      expect(stream.events.some((event) => event.type === "status" && event.connected)).toBe(true),
    );
    return { ...stream, abort: () => controller.abort() };
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

describe("shared diagnostic event stream", () => {
  it("authorizes the shared route and sends classified insertion and Fix actions without an agent turn", async () => {
    const h = await harness();
    h.authorize(false);
    expect((await fetch(h.endpoint)).status).toBe(401);
    h.authorize(true);
    expect((await fetch(h.endpoint.split("?")[0]!)).status).toBe(400);
    expect((await fetch(h.endpoint, { method: "POST" })).status).toBe(405);
    expect(h.server.sendDiagnostics(h.context)).toBe(false);
    const stream = await h.open();
    expect(h.server.clientCount).toBe(1);
    expect(h.server.sendDiagnostics(h.context)).toBe(true);
    const insertion = await stream.waitForDiagnostic(1);
    expect(insertion.action).toBe("send-diagnostic");
    expect(insertion.text).toContain("warning [ts 6133] at 1:7-1:12: Unused variable.");
    expect(insertion.text).toContain("const value = 1;");
    expect(h.server.sendDiagnostics({ ...h.context, action: "fix" })).toBe(true);
    const fix = await stream.waitForDiagnostic(2);
    expect(fix.action).toBe("fix");
    expect(fix.text).toContain(
      "Analyze the errors and warnings at the following location, and try to fix them:",
    );
    expect(fix.text).toContain("Unused variable.");
    expect(h.ctx.agents.get(h.session.id)).toBeUndefined();
  });

  it("shares one socket across browser/session streams and delivers each action once without replay", async () => {
    const h = await harness();
    const first = await h.open();
    const duplicate = await h.open();
    const other = h.ctx.sessions.create(undefined, { meta: { cwd: h.cwd } });
    const second = await h.open(other.id);
    expect(h.server.clientCount).toBe(1);
    expect(h.server.sendDiagnostics({ ...h.context, action: "fix" })).toBe(true);
    expect((await first.waitForDiagnostic(1)).action).toBe("fix");
    expect(duplicate.diagnostics()).toEqual([]);
    expect(second.diagnostics()).toEqual([]);
    first.abort();
    await first.close();
    // Round-trip the real HTTP server after the browser cancels so its response-close cleanup runs.
    expect((await fetch(h.endpoint.split("?")[0]!)).status).toBe(400);
    expect(h.server.clientCount).toBe(1);
    // A status update is a transport barrier: the surviving browser must still receive it.
    h.server.broadcast(undefined);
    await vi.waitFor(() =>
      expect(
        duplicate.events.filter((event) => event.type === "status" && event.connected).length,
      ).toBeGreaterThan(1),
    );
    expect(h.server.sendDiagnostics(h.context)).toBe(true);
    expect((await duplicate.waitForDiagnostic(1)).action).toBe("send-diagnostic");
    expect(second.diagnostics()).toEqual([]);
    await duplicate.close();
    expect((await fetch(h.endpoint.split("?")[0]!)).status).toBe(400);
    h.server.broadcast(undefined);
    await vi.waitFor(() =>
      expect(
        second.events.filter((event) => event.type === "status" && event.connected).length,
      ).toBeGreaterThan(1),
    );
    const next = {
      ...h.context,
      diagnostics: [{ ...h.context.diagnostics[0]!, message: "Second session action." }],
    };
    expect(h.server.sendDiagnostics(next)).toBe(true);
    const last = await second.waitForDiagnostic(1);
    expect(last.text).toContain("Second session action.");
    expect(last.text).not.toContain("Unused variable.");
    expect(first.diagnostics()).toHaveLength(1);
    expect(duplicate.diagnostics()).toHaveLength(1);
    await second.close();
    await vi.waitFor(() => expect(h.server.clientCount).toBe(0));
  });

  it("ends only the disposed session's HTTP stream and keeps the shared IDE live for its survivor", async () => {
    const h = await harness();
    // Use the real SessionStore enter/detach lifecycle, which emits session/disposed.
    const disposedSession = h.ctx.sessions.prepare(undefined, { meta: { cwd: h.cwd } });
    const disposeSession = h.ctx.sessions.enter(disposedSession);
    cleanups.push(disposeSession);
    h.ctx.sessions.announce(disposedSession);
    const disposedStream = await h.open(disposedSession.id);
    const survivor = await h.open();
    expect(h.server.clientCount).toBe(1);
    expect(h.server.sendDiagnostics({ ...h.context, action: "fix" })).toBe(true);
    expect((await disposedStream.waitForDiagnostic(1)).action).toBe("fix");
    expect(survivor.diagnostics()).toEqual([]);

    disposeSession();
    await vi.waitFor(() => expect(disposedStream.ended()).toBe(true));
    expect(h.ctx.sessions.get(disposedSession.id)).toBeUndefined();
    expect(h.ctx.sessions.get(h.session.id)).toBe(h.session);
    expect(survivor.ended()).toBe(false);
    expect(h.server.clientCount).toBe(1);
    const closedEventCount = disposedStream.events.length;
    h.server.broadcast({
      source: "vscode",
      filePath: join(h.cwd, "after-disposal.ts"),
      workspaceFolder: h.cwd,
      ranges: [
        {
          text: "private survivor selection",
          selection: { start: { line: 4, character: 0 }, end: { line: 5, character: 1 } },
        },
      ],
    });
    await vi.waitFor(() =>
      expect(survivor.events.at(-1)).toMatchObject({
        type: "status",
        connected: true,
        lines: 2,
        detail: "after-disposal.ts #L5-L6",
      }),
    );
    expect(h.server.sendDiagnostics({ ...h.context, action: "fix" })).toBe(true);
    expect((await survivor.waitForDiagnostic(1)).action).toBe("fix");
    expect(h.server.sendDiagnostics(h.context)).toBe(true);
    expect((await survivor.waitForDiagnostic(2)).action).toBe("send-diagnostic");
    expect(disposedStream.diagnostics()).toHaveLength(1);
    expect(disposedStream.events).toHaveLength(closedEventCount);
    expect(survivor.diagnostics()).toHaveLength(2);
    expect(h.server.clientCount).toBe(1);
    await survivor.close();
    await vi.waitFor(() => expect(h.server.clientCount).toBe(0));
  });

  it("isolates diagnostic files by session cwd even when sessions share an IDE", async () => {
    const h = await harness();
    // A multi-root IDE matches both sessions; the first session still cannot receive a sibling file.
    const narrowCwd = join(h.cwd, "narrow");
    await writeLock(join(h.root, "vscode.lock"), {
      ...h.lock,
      workspaceFolders: [h.cwd, narrowCwd],
    });
    const narrow = h.ctx.sessions.create(undefined, { meta: { cwd: narrowCwd } });
    const narrowStream = await h.open(narrow.id);
    const parentStream = await h.open();
    expect(h.server.clientCount).toBe(1);
    expect(h.server.sendDiagnostics(h.context)).toBe(true);
    await parentStream.waitForDiagnostic(1);
    expect(narrowStream.diagnostics()).toEqual([]);
    expect(h.server.sendDiagnostics({ ...h.context, filePath: join(h.root, "outside.ts") })).toBe(
      true,
    );
    // Follow the rejected action with a valid action on the same ordered transport.
    expect(h.server.sendDiagnostics({ ...h.context, action: "fix" })).toBe(true);
    await parentStream.waitForDiagnostic(2);
    expect(narrowStream.diagnostics()).toEqual([]);
    expect(parentStream.diagnostics()).toHaveLength(2);
  });

  it("follows manual and disabled targets and tears down the shared route on unload", async () => {
    const h = await harness();
    const nested = join(h.cwd, "nested");
    const other = new IdeServer(TOKEN, () => undefined);
    const port = await other.start();
    cleanups.push(() => other.stop());
    const otherLock = createLock(port, TOKEN, [nested]);
    await writeLock(join(h.root, "nested.lock"), otherLock);
    const stream = await h.open();
    await h.choose({ kind: "manual", ideId: ideLockId(otherLock) });
    await vi.waitFor(() => {
      expect(h.server.clientCount).toBe(0);
      expect(other.clientCount).toBe(1);
    });
    expect(h.server.sendDiagnostics(h.context)).toBe(false);
    expect(
      other.sendDiagnostics({
        ...h.context,
        filePath: join(nested, "file.ts"),
        workspaceFolder: nested,
      }),
    ).toBe(true);
    await stream.waitForDiagnostic(1);
    await h.choose({ kind: "off" });
    await vi.waitFor(() => expect(other.clientCount).toBe(0));
    await vi.waitFor(() =>
      expect(stream.events.at(-1)).toEqual({ type: "status", connected: false, disabled: true }),
    );
    expect(other.sendDiagnostics({ ...h.context, action: "fix" })).toBe(false);
    await h.choose({ kind: "auto" });
    await vi.waitFor(() => expect(h.server.clientCount).toBe(1));
    expect(h.server.sendDiagnostics({ ...h.context, action: "fix" })).toBe(true);
    expect((await stream.waitForDiagnostic(2)).action).toBe("fix");
    await h.fiber.dispose();
    await vi.waitFor(() => expect(h.server.clientCount).toBe(0));
    expect((await fetch(h.endpoint)).status).toBe(404);
  });
});
