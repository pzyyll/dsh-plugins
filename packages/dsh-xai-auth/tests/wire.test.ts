// ABOUTME: Checks subscription headers and serialized requests through the real Responses SDK.
// ABOUTME: A loopback capture sink records requests without serving model responses or using live credentials.

import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer, type IncomingHttpHeaders } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, test, type TestContext } from "node:test";
import { normalizeContext } from "@earendil-works/pi-ai/utils/transcript";
import { FALLBACK_CATALOG } from "../src/catalog.ts";
import {
  API_BASE_URL,
  AUTHENTICATE_RESPONSE_HEADER,
  AUTHENTICATE_RESPONSE_VALUE,
  CLI_CHAT_PROXY_BASE_URL,
  CLIENT_IDENTIFIER,
  CLIENT_IDENTIFIER_HEADER,
  CLIENT_MODE_HEADER,
  CLIENT_MODE_VALUE,
  GROK_CLIENT_VERSION,
  MODEL_OVERRIDE_HEADER,
  SESSION_ID_HEADER,
  TOKEN_AUTH_HEADER,
  TOKEN_AUTH_VALUE,
  USER_ID_HEADER,
} from "../src/constants.ts";
import { resolveGrokUserId, type SuperGrokCredentials } from "../src/grok-auth.ts";
import {
  catalogHeaders,
  catalogToModel,
  createSuperGrokProvider,
  streamSuperGrok,
  subscriptionHeaders,
} from "../src/wire.ts";

const REQUEST_TIMEOUT_MS = 10_000;
const LOOPBACK_HOST = "127.0.0.1";
const CONTEXT = normalizeContext({
  systemPrompt: "Keep the system role.",
  messages: [{ role: "user", content: "Hello", timestamp: 0 }],
});

function jwtWithSubject(subject: string): string {
  return `header.${Buffer.from(JSON.stringify({ sub: subject })).toString("base64url")}.signature`;
}

const ACCESS_TOKEN = jwtWithSubject("personal-user");
const HEADER_TOKEN = jwtWithSubject("header-user");
const CREDENTIALS: SuperGrokCredentials = {
  access: ACCESS_TOKEN,
  refresh: "test-refresh-token",
  expires: Number.MAX_SAFE_INTEGER,
  userId: "team-principal",
};

interface CapturedRequest {
  path: string | undefined;
  headers: IncomingHttpHeaders;
  payload: Record<string, unknown>;
}

async function captureRequests(t: TestContext) {
  const requests: CapturedRequest[] = [];
  const errors: unknown[] = [];
  const server = createServer(async (request, response) => {
    try {
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      requests.push({
        path: request.url,
        headers: request.headers,
        payload: JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>,
      });
    } catch (error) {
      errors.push(error);
    } finally {
      // Close after the complete body arrives. No inference response is fabricated.
      response.destroy();
    }
  });
  t.after(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    assert.deepEqual(errors, []);
  });
  server.listen(0, LOOPBACK_HOST);
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  return { requests, baseUrl: `http://${LOOPBACK_HOST}:${address.port}/v1` };
}

let tempHome: string;
let previousHome: string | undefined;
let previousGrokHome: string | undefined;

beforeEach(() => {
  previousHome = process.env.DSH_HOME;
  previousGrokHome = process.env.GROK_HOME;
  tempHome = mkdtempSync(join(tmpdir(), "dsh-xai-wire-"));
  process.env.DSH_HOME = tempHome;
  process.env.GROK_HOME = join(tempHome, "grok");
});

afterEach(() => {
  if (previousHome === undefined) delete process.env.DSH_HOME;
  else process.env.DSH_HOME = previousHome;
  if (previousGrokHome === undefined) delete process.env.GROK_HOME;
  else process.env.GROK_HOME = previousGrokHome;
  rmSync(tempHome, { recursive: true, force: true });
});

test("identity resolution uses matching principal metadata and otherwise falls back to JWT", () => {
  assert.equal(resolveGrokUserId(ACCESS_TOKEN, CREDENTIALS), "team-principal");
  assert.equal(resolveGrokUserId(HEADER_TOKEN, CREDENTIALS), "header-user");
  assert.equal(resolveGrokUserId(ACCESS_TOKEN, { ...CREDENTIALS, userId: "" }), "personal-user");
  assert.equal(resolveGrokUserId(ACCESS_TOKEN, undefined), "personal-user");
  assert.equal(resolveGrokUserId(undefined, CREDENTIALS), undefined);
  assert.equal(resolveGrokUserId("opaque-token", undefined), undefined);
});

test("catalog headers retain their own contract and use JWT identity without an id token", () => {
  const headers = new Headers(catalogHeaders({ ...CREDENTIALS, userId: undefined }));
  assert.equal(headers.get("authorization"), `Bearer ${ACCESS_TOKEN}`);
  assert.equal(headers.get(TOKEN_AUTH_HEADER), TOKEN_AUTH_VALUE);
  assert.equal(headers.get("x-grok-client-version"), GROK_CLIENT_VERSION);
  assert.equal(headers.get(CLIENT_MODE_HEADER), CLIENT_MODE_VALUE);
  assert.equal(headers.get("x-userid"), "personal-user");
  assert.equal(headers.has(USER_ID_HEADER), false);
  assert.equal(headers.has("x-email"), false);
  assert.equal(headers.has("if-none-match"), false);

  const attributed = new Headers(
    catalogHeaders({ ...CREDENTIALS, email: "test@example.com" }, "catalog-etag"),
  );
  assert.equal(attributed.get("x-userid"), "team-principal");
  assert.equal(attributed.get("x-email"), "test@example.com");
  assert.equal(attributed.get("if-none-match"), "catalog-etag");
});

test("header identity follows the effective Authorization from model and option headers", () => {
  const model = {
    ...catalogToModel(FALLBACK_CATALOG[0]!, CLI_CHAT_PROXY_BASE_URL),
    headers: { AUTHORIZATION: `Bearer ${HEADER_TOKEN}` },
  };
  assert.equal(
    subscriptionHeaders(model, { apiKey: ACCESS_TOKEN }, CREDENTIALS)[USER_ID_HEADER],
    "header-user",
  );
  const headers = subscriptionHeaders(
    model,
    {
      apiKey: ACCESS_TOKEN,
      headers: { Authorization: `bEaReR ${ACCESS_TOKEN}`, "X-Grok-User-ID": "stale-user" },
    },
    CREDENTIALS,
  );
  assert.equal(headers[USER_ID_HEADER], "team-principal");
});

for (const authorization of [null, "", "Basic test-credential"]) {
  test(`suppressed or non-Bearer Authorization does not retain stale identity (${authorization})`, () => {
    const model = catalogToModel(FALLBACK_CATALOG[0]!, CLI_CHAT_PROXY_BASE_URL);
    const headers = subscriptionHeaders(
      model,
      {
        apiKey: ACCESS_TOKEN,
        headers: { Authorization: authorization, "X-Grok-User-ID": "stale-user" },
      },
      CREDENTIALS,
    );
    assert.equal(headers[USER_ID_HEADER], null);
  });
}

for (const baseUrl of [
  API_BASE_URL,
  "https://custom.example.com/v1",
  "https://cli-chat-proxy.grok.com.evil.example/v1",
]) {
  test(`non-proxy endpoints suppress subscription identity and auth headers (${baseUrl})`, () => {
    const model = catalogToModel(FALLBACK_CATALOG[0]!, baseUrl);
    const headers = subscriptionHeaders(
      model,
      {
        apiKey: ACCESS_TOKEN,
        headers: {
          "X-Grok-User-ID": "stale-user",
          "X-XAI-Token-Auth": "stale-auth",
          "X-AuthenticateResponse": "stale-auth",
          "x-custom": "preserved",
        },
      },
      CREDENTIALS,
    );
    assert.equal(headers[USER_ID_HEADER], null);
    assert.equal(headers[TOKEN_AUTH_HEADER], null);
    assert.equal(headers[AUTHENTICATE_RESPONSE_HEADER], null);
    assert.equal(headers["x-custom"], "preserved");
  });
}

test("simple streams serialize the product contract, system role, reasoning and session routing", async (t) => {
  const capture = await captureRequests(t);
  const model = catalogToModel(FALLBACK_CATALOG[0]!, capture.baseUrl);
  const provider = createSuperGrokProvider([model], () => CREDENTIALS);
  const result = await provider
    .streamSimple(model, CONTEXT, {
      apiKey: ACCESS_TOKEN,
      maxRetries: 0,
      timeoutMs: REQUEST_TIMEOUT_MS,
      sessionId: "child-session",
      reasoning: "high",
      headers: {
        "USER-AGENT": "caller-agent",
        "X-Grok-Client-Version": "outdated",
        session_id: "stale",
      },
      samplingParams: { prompt_cache_key: "cache-key", prompt_cache_retention: "24h" },
    })
    .result();
  assert.equal(result.stopReason, "error");
  assert.equal(capture.requests.length, 1);
  const { path, headers, payload } = capture.requests[0]!;
  assert.equal(path, "/v1/responses");
  assert.equal(headers.authorization, `Bearer ${ACCESS_TOKEN}`);
  assert.equal(headers[USER_ID_HEADER], "team-principal");
  assert.equal(headers[TOKEN_AUTH_HEADER], TOKEN_AUTH_VALUE);
  assert.equal(headers[AUTHENTICATE_RESPONSE_HEADER], AUTHENTICATE_RESPONSE_VALUE);
  assert.equal(headers[CLIENT_IDENTIFIER_HEADER], CLIENT_IDENTIFIER);
  assert.equal(headers[CLIENT_MODE_HEADER], CLIENT_MODE_VALUE);
  assert.equal(headers["x-grok-client-version"], GROK_CLIENT_VERSION);
  assert.match(headers["user-agent"] as string, /^grok-shell\/1\.0\.46 \(/);
  assert.equal(headers[SESSION_ID_HEADER], "child-session");
  assert.equal(headers["x-grok-conv-id"], "child-session");
  assert.equal(headers[MODEL_OVERRIDE_HEADER], model.id);
  assert.ok(headers["x-grok-agent-id"]);
  assert.match(headers["x-grok-req-id"] as string, /^xai-perm-auto-/);
  assert.equal(headers.session_id, undefined);
  assert.equal(payload.prompt_cache_key, undefined);
  assert.equal(payload.prompt_cache_retention, undefined);
  assert.deepEqual(payload.reasoning, { effort: "high", summary: "concise" });
  assert.equal((payload.input as Array<{ role?: string }>)[0]?.role, "system");
});

test("serialized Authorization overrides use the new token identity even without an apiKey", async (t) => {
  const capture = await captureRequests(t);
  const model = catalogToModel(FALLBACK_CATALOG[0]!, capture.baseUrl);
  for (const apiKey of [ACCESS_TOKEN, undefined]) {
    await streamSuperGrok(
      model,
      CONTEXT,
      {
        apiKey,
        headers: { AUTHORIZATION: `Bearer ${HEADER_TOKEN}` },
        maxRetries: 0,
        timeoutMs: REQUEST_TIMEOUT_MS,
      },
      CREDENTIALS,
    ).result();
  }
  assert.equal(capture.requests.length, 2);
  for (const { headers } of capture.requests) {
    assert.equal(headers.authorization, `Bearer ${HEADER_TOKEN}`);
    assert.equal(headers[USER_ID_HEADER], "header-user");
  }
});

test("direct provider streams preserve API-specific effort and service tier", async (t) => {
  const capture = await captureRequests(t);
  const model = catalogToModel(FALLBACK_CATALOG[0]!, capture.baseUrl);
  const provider = createSuperGrokProvider([model], () => CREDENTIALS);
  await provider
    .stream(model, CONTEXT, {
      apiKey: ACCESS_TOKEN,
      maxRetries: 0,
      timeoutMs: REQUEST_TIMEOUT_MS,
      reasoningEffort: "xhigh",
      reasoningSummary: "detailed",
      serviceTier: "default",
    })
    .result();
  assert.equal(capture.requests.length, 1);
  assert.deepEqual(capture.requests[0]!.payload.reasoning, { effort: "xhigh", summary: "concise" });
  assert.equal(capture.requests[0]!.payload.service_tier, "default");
});

test("mixed simple and API-specific options retain reasoning with explicit effort taking precedence", async (t) => {
  const capture = await captureRequests(t);
  const model = catalogToModel(FALLBACK_CATALOG[0]!, capture.baseUrl);
  for (const reasoningEffort of [undefined, "low"] as const) {
    await streamSuperGrok(
      model,
      CONTEXT,
      {
        apiKey: ACCESS_TOKEN,
        reasoning: "high",
        reasoningEffort,
        serviceTier: "default",
        maxRetries: 0,
        timeoutMs: REQUEST_TIMEOUT_MS,
      },
      CREDENTIALS,
    ).result();
  }
  assert.equal(capture.requests.length, 2);
  assert.deepEqual(
    capture.requests.map((request) => request.payload.reasoning),
    [
      { effort: "high", summary: "concise" },
      { effort: "low", summary: "concise" },
    ],
  );
  assert.ok(capture.requests.every((request) => request.payload.service_tier === "default"));
});

test("mixed summary options do not enable reasoning when the simple level clamps to off", async (t) => {
  const capture = await captureRequests(t);
  const model = catalogToModel(
    { ...FALLBACK_CATALOG[0]!, reasoningEfforts: ["none"] },
    capture.baseUrl,
  );
  await streamSuperGrok(
    model,
    CONTEXT,
    {
      apiKey: ACCESS_TOKEN,
      reasoning: "minimal",
      reasoningSummary: "detailed",
      maxRetries: 0,
      timeoutMs: REQUEST_TIMEOUT_MS,
    },
    CREDENTIALS,
  ).result();
  assert.equal(capture.requests.length, 1);
  assert.deepEqual(capture.requests[0]!.payload.reasoning, { effort: "none", summary: "concise" });
});

test("replacement payloads retain caller fields and reapply always-on reasoning and cache rules", async (t) => {
  const capture = await captureRequests(t);
  const model = catalogToModel(
    { ...FALLBACK_CATALOG[0]!, id: "grok-composer-2.5-fast" },
    capture.baseUrl,
  );
  let observed = false;
  await streamSuperGrok(
    model,
    CONTEXT,
    {
      apiKey: ACCESS_TOKEN,
      reasoning: "high",
      maxRetries: 0,
      timeoutMs: REQUEST_TIMEOUT_MS,
      onPayload: async (payload) => {
        observed = true;
        assert.deepEqual((payload as Record<string, unknown>).reasoning, { summary: "concise" });
        return {
          ...(payload as object),
          metadata: { caller: "preserved" },
          prompt_cache_key: "replacement-cache",
          prompt_cache_retention: "24h",
          reasoning: { effort: "high", summary: "auto" },
        };
      },
    },
    CREDENTIALS,
  ).result();
  assert.equal(observed, true);
  assert.equal(capture.requests.length, 1);
  const { payload } = capture.requests[0]!;
  assert.deepEqual(payload.metadata, { caller: "preserved" });
  assert.deepEqual(payload.reasoning, { summary: "concise" });
  assert.equal(payload.prompt_cache_key, undefined);
  assert.equal(payload.prompt_cache_retention, undefined);
});

test("parallel child requests keep distinct session and request IDs and preserve in-place payload edits", async (t) => {
  const capture = await captureRequests(t);
  const model = catalogToModel(FALLBACK_CATALOG[1]!, capture.baseUrl);
  await Promise.all(
    ["child-a", "child-b"].map((sessionId) =>
      streamSuperGrok(
        model,
        CONTEXT,
        {
          apiKey: ACCESS_TOKEN,
          sessionId,
          maxRetries: 0,
          timeoutMs: REQUEST_TIMEOUT_MS,
          onPayload: async (payload) => {
            (payload as Record<string, unknown>).metadata = { session: sessionId };
          },
        },
        CREDENTIALS,
      ).result(),
    ),
  );
  assert.equal(capture.requests.length, 2);
  assert.deepEqual(capture.requests.map((request) => request.headers[SESSION_ID_HEADER]).sort(), [
    "child-a",
    "child-b",
  ]);
  assert.equal(
    new Set(capture.requests.map((request) => request.headers["x-grok-req-id"])).size,
    capture.requests.length,
  );
  for (const { headers, payload } of capture.requests) {
    assert.deepEqual(payload.metadata, { session: headers[SESSION_ID_HEADER] });
    assert.deepEqual(payload.reasoning, { summary: "concise" });
  }
});

test("cancellation reaches the real SDK before any network request", async (t) => {
  const capture = await captureRequests(t);
  const model = catalogToModel(FALLBACK_CATALOG[0]!, capture.baseUrl);
  const controller = new AbortController();
  const result = await streamSuperGrok(
    model,
    CONTEXT,
    {
      apiKey: ACCESS_TOKEN,
      signal: controller.signal,
      maxRetries: 0,
      timeoutMs: REQUEST_TIMEOUT_MS,
      onPayload: () => {
        controller.abort();
      },
    },
    CREDENTIALS,
  ).result();
  assert.equal(result.stopReason, "aborted");
  assert.equal(capture.requests.length, 0);
});
