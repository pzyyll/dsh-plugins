// ABOUTME: Registers the xAI SuperGrok subscription provider in dsh.
// ABOUTME: Built by Rsbuild; runtime peer dependencies are supplied by dsh.
import { TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";
import { credentialKey } from "@deepseek-ai/dsh-credentials";
import { LlmError, attributionHeaders, resolveImageAttachmentAccess, resolveRetryPolicy } from "@deepseek-ai/dsh-llm";
import { PiAiAdapter } from "@deepseek-ai/dsh-llm-pi-ai";
import { dshCachePath } from "@deepseek-ai/dsh-home-paths";
import { clampThinkingLevel } from "@earendil-works/pi-ai/models";
import { openAIResponsesApi } from "@earendil-works/pi-ai/api/openai-responses.lazy";
import { createRequire as __rspack_createRequire } from "node:module";
const __rspack_createRequire_require = __rspack_createRequire(import.meta.url);
// The require scope
var __webpack_require__ = {};

// webpack/runtime/define_property_getters
(() => {
__webpack_require__.d = (exports, getters, values) => {
	var define = (defs, kind) => {
		for(var key in defs) {
			if(__webpack_require__.o(defs, key) && !__webpack_require__.o(exports, key)) {
				Object.defineProperty(exports, key, { enumerable: true, [kind]: defs[key] });
			}
		}
	};
	define(getters, "get");
	define(values, "value");
};
})();
// webpack/runtime/has_own_property
(() => {
__webpack_require__.o = (obj, prop) => (Object.prototype.hasOwnProperty.call(obj, prop))
})();
var __webpack_exports__ = {};

// EXPORTS
__webpack_require__.d(__webpack_exports__, {
  Bb: () => (/* binding */ apply),
  WQ: () => (/* binding */ inject),
  UU: () => (/* binding */ src_name)
});

;// CONCATENATED MODULE: external "@deepseek-ai/dsh-typert-protocol"

;// CONCATENATED MODULE: ./src/constants.ts
// ABOUTME: Fixed SuperGrok subscription endpoints, client identity, and OAuth parameters.
// ABOUTME: Values stay lockstepped with grok-build's cli-chat-proxy session path.
/** Harness route and credential id for this subscription provider. */ const PROVIDER_ID = 'xai-supergrok';
/** Plugin name and credential-record scope. */ const PLUGIN_NAME = 'dsh-xai-auth';
/** User-facing provider label. */ const PROVIDER_LABEL = 'xAI SuperGrok';
const constants_OIDC_ISSUER = 'https://auth.x.ai';
const constants_OIDC_CLIENT_ID = 'b1a00492-073a-47ea-816f-4c329264a828';
const TOKEN_URL = 'https://auth.x.ai/oauth2/token';
const DEVICE_AUTHORIZATION_URL = 'https://auth.x.ai/oauth2/device/code';
const DEVICE_CODE_GRANT_TYPE = 'urn:ietf:params:oauth:grant-type:device_code';
/** grok-build personal OAuth scopes for a Grok Build session. */ const OAUTH_SCOPE = 'openid profile email offline_access grok-cli:access api:access conversations:read conversations:write workspaces:read workspaces:write';
const CLI_CHAT_PROXY_BASE_URL = 'https://cli-chat-proxy.grok.com/v1';
/** SuperGrok subscription credits. Same route usage-bar reads for the Grok channel. */ const BILLING_URL = `${CLI_CHAT_PROXY_BASE_URL}/billing?format=credits`;
/** How long a successful usage read stays on the Plugins page before the next fetch. */ const USAGE_CACHE_TTL_MS = 120000;
/** Bound one billing request so a stalled proxy cannot hold the page. */ const USAGE_FETCH_TIMEOUT_MS = 12000;
const API_BASE_URL = 'https://api.x.ai/v1';
/** Set to 1 to send the OAuth session to api.x.ai instead of cli-chat-proxy. */ const ENV_OAUTH_USE_API_URL = 'GROK_OAUTH_USE_API_URL';
/** Lockstepped grok-build CLI version sent as x-grok-client-version. */ const GROK_CLIENT_VERSION = '1.0.46';
const CLIENT_IDENTIFIER = 'grok-shell';
const CLIENT_SURFACE = 'ui';
const OAUTH_REFERRER = 'grok-build';
const TOKEN_AUTH_HEADER = 'x-xai-token-auth';
const TOKEN_AUTH_VALUE = 'xai-grok-cli';
const AUTHENTICATE_RESPONSE_HEADER = 'x-authenticateresponse';
const AUTHENTICATE_RESPONSE_VALUE = 'authenticate-response';
const CLIENT_MODE_HEADER = 'x-grok-client-mode';
const CLIENT_MODE_VALUE = 'interactive';
const CLIENT_IDENTIFIER_HEADER = 'x-grok-client-identifier';
const SESSION_ID_HEADER = 'x-grok-session-id';
const MODEL_OVERRIDE_HEADER = 'x-grok-model-override';
const USER_ID_HEADER = 'x-grok-user-id';
/** Refresh this long before the access token's hard expiry. Matches grok-build. */ const EARLY_INVALIDATION_MS = 300000;
/** Fallback lifetime when the issuer omits expires_at. Matches grok-build TOKEN_TTL. */ const constants_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const DEVICE_CODE_DEFAULT_INTERVAL_MS = 5000;
const DEVICE_CODE_MIN_INTERVAL_MS = 1000;
const DEVICE_CODE_SLOW_DOWN_INCREMENT_MS = 5000;
const DEVICE_CODE_DEFAULT_EXPIRES_MS = 5 * 60 * 1000;
const OAUTH_POLLING_SAFETY_MARGIN_MS = 3000;
/** grok-build models cache TTL. */ const MODELS_CACHE_TTL_MS = 300000;
const constants_GROK_AUTH_FILE = 'auth.json';
const GROK_BUILD_MODELS_CACHE_FILE = 'models_cache.json';
const GROK_AGENT_ID_FILE = 'agent_id';
const CACHE_DIR_NAME = 'xai-supergrok';
const MODELS_CACHE_FILE = 'models-cache.json';
const AGENT_ID_FILE = 'agent-id';
/** Match dsh-llm-pi-ai profile defaults so image and idle limits stay familiar. */ const STREAM_IDLE_TIMEOUT_MS = 300000;
const MAX_REQUEST_IMAGE_BYTES = 20 * 1024 * 1024;
const REQUEST_IMAGE_PIXEL_BUDGET = 2048 * 2048;
const REQUEST_IMAGE_MAX_BYTES = 1024 * 1024;
function oauthBaseUrl(env = process.env) {
    const flag = env[ENV_OAUTH_USE_API_URL];
    return flag && flag !== '0' && flag !== 'false' ? API_BASE_URL : CLI_CHAT_PROXY_BASE_URL;
}

;// CONCATENATED MODULE: external "@deepseek-ai/dsh-credentials"

;// CONCATENATED MODULE: external "@deepseek-ai/dsh-llm"

;// CONCATENATED MODULE: external "@deepseek-ai/dsh-llm-pi-ai"

;// CONCATENATED MODULE: ./src/catalog.ts
// ABOUTME: Parses cli-chat-proxy model catalogs and aligns Responses bodies to grok-build.
// ABOUTME: Effort menus and list prices stay explicit; unknown model ids cost zero.
/** Canonical wire values for Responses reasoning.effort. */ /** Offered when the server marks effort selectable but lists no menu. */ const LEGACY_REASONING_EFFORTS = [
    'low',
    'medium',
    'high',
    'xhigh'
];
/** Default context window when a remote entry omits one. */ const DEFAULT_CONTEXT_WINDOW = 256000;
const DEFAULT_MAX_OUTPUT_TOKENS = 128000;
const ZERO_COST = {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0
};
/** USD per 1M tokens. Short-context list prices only; subscription billing differs. */ const OFFICIAL_XAI_PRICING = {
    'grok-build-0.1': {
        input: 1,
        output: 2,
        cacheRead: 0.2,
        cacheWrite: 0
    },
    'grok-4.5': {
        input: 2,
        output: 6,
        cacheRead: 0.5,
        cacheWrite: 0
    },
    'grok-4.3': {
        input: 1.25,
        output: 2.5,
        cacheRead: 0.2,
        cacheWrite: 0
    },
    'grok-4.20-multi-agent-0309': {
        input: 1.25,
        output: 2.5,
        cacheRead: 0.2,
        cacheWrite: 0
    },
    'grok-4.20-0309-reasoning': {
        input: 1.25,
        output: 2.5,
        cacheRead: 0.2,
        cacheWrite: 0
    },
    'grok-4.20-0309-non-reasoning': {
        input: 1.25,
        output: 2.5,
        cacheRead: 0.2,
        cacheWrite: 0
    },
    'grok-composer-2.5-fast': {
        input: 0.5,
        output: 2.5,
        cacheRead: 0.2,
        cacheWrite: 0
    }
};
const PRICING_ALIASES = {
    'grok-build': 'grok-build-0.1',
    'grok-build-latest': 'grok-build-0.1',
    'grok-4.5-latest': 'grok-4.5',
    'grok-4.3-latest': 'grok-4.3',
    'grok-compose-2.5-fast': 'grok-composer-2.5-fast',
    'composer-2.5-fast': 'grok-composer-2.5-fast'
};
function resolveXaiModelCost(modelId) {
    const rates = OFFICIAL_XAI_PRICING[PRICING_ALIASES[modelId] ?? modelId];
    return rates ? {
        ...rates
    } : {
        ...ZERO_COST
    };
}
const FALLBACK_CATALOG = [
    {
        id: 'grok-4.5',
        name: 'Grok 4.5',
        reasoning: true,
        input: [
            'text',
            'image'
        ],
        cost: resolveXaiModelCost('grok-4.5'),
        contextWindow: 500000,
        maxTokens: DEFAULT_MAX_OUTPUT_TOKENS
    },
    {
        id: 'grok-build',
        name: 'Grok Build',
        reasoning: false,
        input: [
            'text',
            'image'
        ],
        cost: resolveXaiModelCost('grok-build'),
        contextWindow: 500000,
        maxTokens: DEFAULT_MAX_OUTPUT_TOKENS
    }
];
function catalog_isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function firstString(obj, ...keys) {
    for (const key of keys){
        const value = obj[key];
        if (typeof value === 'string' && value.length > 0) return value;
    }
    return undefined;
}
function firstNumber(obj, ...keys) {
    for (const key of keys){
        const value = obj[key];
        if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value;
        if (typeof value === 'string' && value.trim() !== '') {
            const parsed = Number(value);
            if (Number.isFinite(parsed) && parsed > 0) return parsed;
        }
    }
    return undefined;
}
function firstBool(obj, ...keys) {
    for (const key of keys){
        const value = obj[key];
        if (typeof value === 'boolean') return value;
    }
    return undefined;
}
function parseReasoningEffortToken(token) {
    switch(token.toLowerCase()){
        case 'none':
            return 'none';
        case 'minimal':
            return 'minimal';
        case 'low':
            return 'low';
        case 'medium':
            return 'medium';
        case 'high':
            return 'high';
        case 'xhigh':
        case 'max':
            return 'xhigh';
        default:
            return undefined;
    }
}
function parseReasoningEffortOptions(raw) {
    if (!Array.isArray(raw)) return undefined;
    const out = [];
    const seen = new Set();
    for (const entry of raw){
        const token = typeof entry === 'string' ? entry : catalog_isRecord(entry) && typeof entry.value === 'string' ? entry.value : undefined;
        if (token === undefined) continue;
        const effort = parseReasoningEffortToken(token);
        if (effort === undefined || seen.has(effort)) continue;
        seen.add(effort);
        out.push(effort);
    }
    return out.length > 0 ? out : undefined;
}
function buildThinkingLevelMap(efforts = LEGACY_REASONING_EFFORTS) {
    const offered = new Set(efforts.length > 0 ? efforts : LEGACY_REASONING_EFFORTS);
    return {
        off: offered.has('none') ? 'none' : null,
        minimal: offered.has('minimal') ? 'minimal' : null,
        low: offered.has('low') ? 'low' : null,
        medium: offered.has('medium') ? 'medium' : null,
        high: offered.has('high') ? 'high' : null,
        xhigh: offered.has('xhigh') ? 'xhigh' : null
    };
}
/** Always-on reasoning models reject a selectable effort but still reason. */ function isAlwaysOnReasoningModel(id) {
    return /composer[-_]?2\.5/i.test(id);
}
const ALWAYS_ON_REASONING_THINKING_LEVEL_MAP = {
    off: null,
    minimal: null,
    low: null,
    medium: null,
    high: 'high',
    xhigh: null
};
function thinkingLevelMapForCatalog(entry) {
    if (!entry.reasoning) return undefined;
    if (isAlwaysOnReasoningModel(entry.id) && !entry.reasoningEfforts?.length) {
        return ALWAYS_ON_REASONING_THINKING_LEVEL_MAP;
    }
    return buildThinkingLevelMap(entry.reasoningEfforts ?? LEGACY_REASONING_EFFORTS);
}
function decodeBase64UrlJson(segment) {
    const padded = segment.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((segment.length + 3) % 4);
    return JSON.parse(globalThis.atob(padded));
}
/** Unverified JWT claim peek for request attribution. Not an auth check. */ function catalog_peekJwtUserId(token) {
    const parts = token.split('.');
    const payloadSegment = parts[1];
    if (parts.length < 2 || payloadSegment === undefined) return undefined;
    try {
        const payload = decodeBase64UrlJson(payloadSegment);
        if (!catalog_isRecord(payload)) return undefined;
        return firstString(payload, 'sub', 'user_id', 'userId');
    } catch  {
        return undefined;
    }
}
function decodeJwtPayload(token) {
    const parts = token.split('.');
    const payloadSegment = parts[1];
    if (parts.length < 2 || payloadSegment === undefined) return undefined;
    try {
        const payload = decodeBase64UrlJson(payloadSegment);
        return catalog_isRecord(payload) ? payload : undefined;
    } catch  {
        return undefined;
    }
}
function parseRemoteModelEntry(value) {
    if (!catalog_isRecord(value)) return undefined;
    const meta = catalog_isRecord(value._meta) ? value._meta : undefined;
    const hidden = firstBool(value, 'hidden') ?? (meta ? firstBool(meta, 'hidden') : undefined) ?? false;
    if (hidden) return undefined;
    const id = firstString(value, 'model', 'modelId', 'id') ?? (meta ? firstString(meta, 'model', 'modelId') : undefined);
    if (id === undefined) return undefined;
    const contextWindow = firstNumber(value, 'contextWindow', 'context_window') ?? (meta ? firstNumber(meta, 'contextWindow', 'totalContextTokens') : undefined) ?? DEFAULT_CONTEXT_WINDOW;
    const maxCompletion = firstNumber(value, 'maxCompletionTokens', 'max_completion_tokens') ?? (meta ? firstNumber(meta, 'maxCompletionTokens', 'max_completion_tokens') : undefined);
    const supportsEffort = firstBool(value, 'supportsReasoningEffort', 'supports_reasoning_effort') ?? (meta ? firstBool(meta, 'supportsReasoningEffort', 'supports_reasoning_effort') : undefined) ?? false;
    const effortsRaw = value.reasoningEfforts ?? value.reasoning_efforts ?? (meta ? meta.reasoningEfforts ?? meta.reasoning_efforts : undefined);
    const reasoningEfforts = supportsEffort ? parseReasoningEffortOptions(effortsRaw) : undefined;
    return {
        id,
        name: firstString(value, 'name') ?? id,
        reasoning: supportsEffort || isAlwaysOnReasoningModel(id),
        ...reasoningEfforts === undefined ? {} : {
            reasoningEfforts
        },
        input: [
            'text',
            'image'
        ],
        cost: resolveXaiModelCost(id),
        contextWindow,
        maxTokens: maxCompletion ?? Math.min(contextWindow, DEFAULT_MAX_OUTPUT_TOKENS)
    };
}
function parseRemoteModels(payload) {
    if (!catalog_isRecord(payload) || !Array.isArray(payload.data)) return [];
    const models = [];
    const seen = new Set();
    for (const entry of payload.data){
        const model = parseRemoteModelEntry(entry);
        if (model === undefined || seen.has(model.id)) continue;
        seen.add(model.id);
        models.push(model);
    }
    return models;
}
function modelsListUrl(baseUrl) {
    return `${baseUrl.replace(/\/+$/, '')}/models`;
}
/**
 * grok-build CreateResponse leaves cache keys unset and always sends reasoning.summary.
 * Always-on models reject an explicit effort, so that field is removed.
 */ function alignGrokBuildResponsesPayload(payload, modelId) {
    if (!catalog_isRecord(payload)) return payload;
    const next = {
        ...payload
    };
    delete next.prompt_cache_key;
    delete next.prompt_cache_retention;
    const stripEffort = modelId !== undefined && isAlwaysOnReasoningModel(modelId);
    if (catalog_isRecord(next.reasoning)) {
        const reasoning = {
            ...next.reasoning,
            summary: 'concise'
        };
        if (stripEffort) delete reasoning.effort;
        next.reasoning = reasoning;
    } else {
        next.reasoning = {
            summary: 'concise'
        };
    }
    return next;
}

;// CONCATENATED MODULE: external "node:fs"
const external_node_fs_namespaceObject = __rspack_createRequire_require("node:fs");
;// CONCATENATED MODULE: external "node:os"
const external_node_os_namespaceObject = __rspack_createRequire_require("node:os");
;// CONCATENATED MODULE: external "node:path"
const external_node_path_namespaceObject = __rspack_createRequire_require("node:path");
;// CONCATENATED MODULE: ./src/grok-paths.ts
// ABOUTME: Resolves the read-only Grok Build home and OAuth scope key.
// ABOUTME: These paths are never written by the Harness plugin.



function grokHome(env = process.env) {
    return env.GROK_HOME || (0,external_node_path_namespaceObject.join)((0,external_node_os_namespaceObject.homedir)(), '.grok');
}
function grok_paths_grokAuthPath(env = process.env) {
    return join(grokHome(env), GROK_AUTH_FILE);
}
function grokAgentIdPath(env = process.env) {
    return (0,external_node_path_namespaceObject.join)(grokHome(env), GROK_AGENT_ID_FILE);
}
function grokBuildModelsCachePath(env = process.env) {
    return (0,external_node_path_namespaceObject.join)(grokHome(env), GROK_BUILD_MODELS_CACHE_FILE);
}
/** auth.json scope key: `{issuer}::{client_id}`. */ function grok_paths_authScopeKey(issuer = OIDC_ISSUER, clientId = OIDC_CLIENT_ID) {
    return `${issuer.replace(/\/+$/, '')}::${clientId}`;
}

;// CONCATENATED MODULE: ./src/grok-auth.ts
// ABOUTME: Reads a Grok Build session and builds Harness-owned SuperGrok credentials.
// ABOUTME: Import copies tokens once; refresh never writes ~/.grok/auth.json.




function isGrokAuthEntry(value) {
    return isRecord(value) && typeof value.key === 'string' && value.key.length > 0;
}
function readGrokAuthStore(path = grokAuthPath()) {
    try {
        const raw = readFileSync(path, 'utf8').trim();
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        if (!isRecord(parsed)) return {};
        const store = {};
        for (const [scope, entry] of Object.entries(parsed)){
            if (isGrokAuthEntry(entry)) store[scope] = entry;
        }
        return store;
    } catch  {
        return {};
    }
}
function isSessionAuthMode(mode) {
    const normalized = (mode ?? 'oidc').toLowerCase();
    return normalized === 'oidc' || normalized === 'web_login' || normalized === 'grok';
}
function findSessionAuth(store = readGrokAuthStore(), preferredScope = authScopeKey()) {
    const preferred = store[preferredScope];
    if (preferred?.refresh_token && isSessionAuthMode(preferred.auth_mode)) {
        return {
            scope: preferredScope,
            entry: preferred
        };
    }
    for (const [scope, entry] of Object.entries(store)){
        if (!entry.refresh_token || !entry.oidc_issuer) continue;
        if (!isSessionAuthMode(entry.auth_mode)) continue;
        if (String(entry.auth_mode).toLowerCase() === 'web_login') continue;
        return {
            scope,
            entry
        };
    }
    if (preferred?.key) return {
        scope: preferredScope,
        entry: preferred
    };
    return undefined;
}
function parseIsoMs(value) {
    if (!value) return undefined;
    const ms = Date.parse(value);
    return Number.isFinite(ms) ? ms : undefined;
}
function isCredentialExpired(credentials, nowMs = Date.now()) {
    return nowMs >= credentials.expires;
}
function grokAuthToCredentials(entry, nowMs = Date.now()) {
    const expiresMs = parseIsoMs(entry.expires_at ?? undefined);
    const createdMs = parseIsoMs(entry.create_time) ?? nowMs;
    const hardExpiry = expiresMs ?? createdMs + TOKEN_TTL_MS;
    const userId = typeof entry.user_id === 'string' && entry.user_id || peekJwtUserId(entry.key) || undefined;
    return {
        access: entry.key,
        refresh: entry.refresh_token ?? '',
        expires: Math.max(nowMs, hardExpiry - (/* inlined export .EARLY_INVALIDATION_MS */300000)),
        ...userId === undefined ? {} : {
            userId
        },
        ...entry.email ? {
            email: entry.email
        } : {},
        ...entry.first_name ? {
            firstName: entry.first_name
        } : {},
        ...entry.last_name ? {
            lastName: entry.last_name
        } : {},
        ...entry.principal_type ? {
            principalType: entry.principal_type
        } : {},
        ...entry.principal_id ? {
            principalId: entry.principal_id
        } : {},
        ...entry.team_id ? {
            teamId: entry.team_id
        } : {},
        ...typeof entry.coding_data_retention_opt_out === 'boolean' ? {
            codingDataRetentionOptOut: entry.coding_data_retention_opt_out
        } : {},
        ...entry.oidc_issuer ? {
            oidcIssuer: entry.oidc_issuer
        } : {},
        ...entry.oidc_client_id ? {
            oidcClientId: entry.oidc_client_id
        } : {},
        ...entry.create_time ? {
            createTime: entry.create_time
        } : {}
    };
}
function importCredentialsFromGrokAuth(path = grokAuthPath()) {
    const found = findSessionAuth(readGrokAuthStore(path));
    if (!found?.entry.refresh_token) return undefined;
    return grokAuthToCredentials(found.entry);
}
function describeGrokAuthSession(credentials) {
    return credentials.email || credentials.userId || 'existing session';
}
/** Use stored principal metadata only for its own token, then fall back to JWT attribution. */ function resolveGrokUserId(accessToken, credentials) {
    const storedUser = credentials !== undefined && credentials.access === accessToken ? credentials.userId : undefined;
    return storedUser || (accessToken ? catalog_peekJwtUserId(accessToken) : undefined);
}
function firstClaim(obj, ...keys) {
    for (const key of keys){
        const value = obj[key];
        if (typeof value === 'string' && value.length > 0) return value;
    }
    return undefined;
}
function credentialsFromTokens(tokens, previous, now = new Date()) {
    const accessClaims = decodeJwtPayload(tokens.accessToken) ?? {};
    const idClaims = tokens.idToken ? decodeJwtPayload(tokens.idToken) ?? {} : {};
    const principalType = firstClaim(accessClaims, 'principal_type', 'principalType') ?? previous?.principalType;
    const principalId = firstClaim(accessClaims, 'principal_id', 'principalId') ?? previous?.principalId;
    const tokenTeamId = firstClaim(accessClaims, 'team_id', 'teamId');
    const idSub = firstClaim(idClaims, 'sub', 'user_id', 'userId');
    const idEmail = firstClaim(idClaims, 'email');
    let userId = idSub ?? previous?.userId;
    let email = idEmail ?? previous?.email;
    let teamId = tokenTeamId ?? previous?.teamId;
    if (principalType === 'Team' && principalId) {
        userId = principalId;
        email = undefined;
        teamId = principalId;
    } else if (principalType === 'Organization' && principalId) {
        userId = principalId;
        email = undefined;
    }
    const expiresMs = tokens.expiresInSeconds && tokens.expiresInSeconds > 0 ? now.getTime() + tokens.expiresInSeconds * 1000 : now.getTime() + constants_TOKEN_TTL_MS;
    return {
        access: tokens.accessToken,
        refresh: tokens.refreshToken,
        expires: Math.max(now.getTime(), expiresMs - (/* inlined export .EARLY_INVALIDATION_MS */300000)),
        ...userId === undefined ? {} : {
            userId
        },
        ...email === undefined ? {} : {
            email
        },
        ...previous?.firstName === undefined ? {} : {
            firstName: previous.firstName
        },
        ...previous?.lastName === undefined ? {} : {
            lastName: previous.lastName
        },
        ...principalType === undefined ? {} : {
            principalType
        },
        ...principalId === undefined ? {} : {
            principalId
        },
        ...teamId === undefined ? {} : {
            teamId
        },
        ...previous?.codingDataRetentionOptOut === undefined ? {} : {
            codingDataRetentionOptOut: previous.codingDataRetentionOptOut
        },
        oidcIssuer: previous?.oidcIssuer ?? constants_OIDC_ISSUER,
        oidcClientId: previous?.oidcClientId ?? constants_OIDC_CLIENT_ID,
        ...previous?.createTime === undefined ? {
            createTime: now.toISOString()
        } : {
            createTime: previous.createTime
        }
    };
}
function isSuperGrokCredentials(value) {
    return catalog_isRecord(value) && typeof value.access === 'string' && value.access.length > 0 && typeof value.refresh === 'string' && typeof value.expires === 'number' && Number.isFinite(value.expires);
}

;// CONCATENATED MODULE: external "@deepseek-ai/dsh-home-paths"

;// CONCATENATED MODULE: ./src/paths.ts
// ABOUTME: Resolves this plugin's Harness cache for the model catalog and agent id.
// ABOUTME: Grok Build files stay read-only; owned files live under the dsh cache.


function pluginCachePath(...segments) {
    return dshCachePath(CACHE_DIR_NAME, ...segments);
}
function modelsCachePath() {
    return pluginCachePath(MODELS_CACHE_FILE);
}
function agentIdPath() {
    return pluginCachePath(AGENT_ID_FILE);
}

;// CONCATENATED MODULE: ./src/models-cache.ts
// ABOUTME: Persists the SuperGrok model catalog under the Harness cache.
// ABOUTME: A missing cache can warm-start from Grok Build's read-only models_cache.json.






function parseFetchedAtMs(value) {
    if (!value) return undefined;
    const ms = Date.parse(value);
    return Number.isFinite(ms) ? ms : undefined;
}
function isModelsCacheFresh(cache, ttlMs = (/* inlined export .MODELS_CACHE_TTL_MS */300000), nowMs = Date.now()) {
    const fetched = parseFetchedAtMs(cache.fetched_at);
    if (fetched === undefined) return false;
    const age = nowMs - fetched;
    return age >= 0 && age < ttlMs;
}
function readJsonFile(path) {
    try {
        const raw = (0,external_node_fs_namespaceObject.readFileSync)(path, 'utf8').trim();
        if (!raw) return undefined;
        return JSON.parse(raw);
    } catch  {
        return undefined;
    }
}
function atomicWriteJson(path, value) {
    (0,external_node_fs_namespaceObject.mkdirSync)((0,external_node_path_namespaceObject.dirname)(path), {
        recursive: true
    });
    const tmp = `${path}.tmp.${process.pid}.${Date.now()}`;
    (0,external_node_fs_namespaceObject.writeFileSync)(tmp, `${JSON.stringify(value, null, 2)}\n`, {
        encoding: 'utf8',
        mode: 384
    });
    (0,external_node_fs_namespaceObject.renameSync)(tmp, path);
}
function catalogFromCacheModelsMap(models) {
    if (!catalog_isRecord(models)) return [];
    const out = [];
    const seen = new Set();
    for (const [key, value] of Object.entries(models)){
        const entry = catalog_isRecord(value) && value.info !== undefined ? value.info : value;
        const parsed = parseRemoteModelEntry(entry);
        if (parsed === undefined || seen.has(parsed.id || key)) continue;
        const id = parsed.id || key;
        seen.add(id);
        out.push(id === parsed.id ? parsed : {
            ...parsed,
            id
        });
    }
    return out;
}
function parseModelsCacheFile(value) {
    if (!catalog_isRecord(value) || !catalog_isRecord(value.models)) return undefined;
    return {
        fetched_at: typeof value.fetched_at === 'string' ? value.fetched_at : new Date(0).toISOString(),
        ...typeof value.auth_method === 'string' ? {
            auth_method: value.auth_method
        } : {},
        ...typeof value.origin === 'string' ? {
            origin: value.origin
        } : {},
        ...typeof value.etag === 'string' ? {
            etag: value.etag
        } : {},
        models: value.models
    };
}
function loadCacheAt(path, source, expectedOrigin) {
    const parsed = parseModelsCacheFile(readJsonFile(path));
    if (parsed === undefined) return undefined;
    if (expectedOrigin && parsed.origin && parsed.origin !== expectedOrigin) return undefined;
    const models = catalogFromCacheModelsMap(parsed.models);
    if (models.length === 0) return undefined;
    return {
        models,
        ...parsed.etag === undefined ? {} : {
            etag: parsed.etag
        },
        fresh: isModelsCacheFresh(parsed),
        ...parsed.origin === undefined ? {} : {
            origin: parsed.origin
        },
        source
    };
}
function loadModelsCatalog(expectedOrigin) {
    return loadCacheAt(modelsCachePath(), 'dsh', expectedOrigin) ?? loadCacheAt(grokBuildModelsCachePath(), 'grok-build', expectedOrigin);
}
function saveModelsCatalog(models, meta) {
    if (models.length === 0) return;
    const map = {};
    for (const model of models){
        map[model.id] = {
            info: {
                id: model.id,
                model: model.id,
                name: model.name,
                context_window: model.contextWindow,
                max_completion_tokens: model.maxTokens,
                supports_reasoning_effort: model.reasoning && !isAlwaysOnReasoningModel(model.id),
                hidden: false
            }
        };
    }
    const cache = {
        fetched_at: (meta.fetchedAt ?? new Date()).toISOString(),
        auth_method: 'session',
        origin: meta.origin,
        ...meta.etag === undefined ? {} : {
            etag: meta.etag
        },
        models: map
    };
    atomicWriteJson(modelsCachePath(), cache);
}

;// CONCATENATED MODULE: external "node:timers/promises"
const promises_namespaceObject = __rspack_createRequire_require("node:timers/promises");
;// CONCATENATED MODULE: ./src/oauth.ts
// ABOUTME: Exchanges xAI device-code and refresh grants for SuperGrok session tokens.
// ABOUTME: Polling follows the issuer interval, including slow_down, and stops on abort.



function authHeaders() {
    return {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
        'x-grok-client-version': (/* inlined export .GROK_CLIENT_VERSION */"1.0.46"),
        'x-grok-client-surface': (/* inlined export .CLIENT_SURFACE */"ui")
    };
}
function positiveSecondsToMs(value, defaultMs) {
    const seconds = Number(value);
    return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : defaultMs;
}
async function responseText(response) {
    return response.text().catch(()=>'');
}
async function requestDeviceCode(signal) {
    const response = await globalThis.fetch(DEVICE_AUTHORIZATION_URL, {
        method: 'POST',
        headers: authHeaders(),
        body: new URLSearchParams({
            client_id: constants_OIDC_CLIENT_ID,
            scope: OAUTH_SCOPE,
            referrer: OAUTH_REFERRER
        }).toString(),
        signal
    });
    if (!response.ok) {
        const detail = await responseText(response);
        throw new Error(`xAI device code request failed (${response.status})${detail ? `: ${detail}` : ''}`);
    }
    const json = await response.json();
    if (!json.device_code || !json.user_code || !json.verification_uri) {
        throw new Error('xAI device code response is missing device_code, user_code, or verification_uri');
    }
    return json;
}
function deviceInstructions(device) {
    return {
        url: device.verification_uri_complete ?? device.verification_uri,
        code: device.user_code
    };
}
async function pollDeviceCodeToken(device, signal) {
    const expiresInMs = positiveSecondsToMs(device.expires_in, (/* inlined export .DEVICE_CODE_DEFAULT_EXPIRES_MS */300000));
    const deadline = Date.now() + expiresInMs;
    let intervalMs = Math.max(positiveSecondsToMs(device.interval, (/* inlined export .DEVICE_CODE_DEFAULT_INTERVAL_MS */5000)), (/* inlined export .DEVICE_CODE_MIN_INTERVAL_MS */1000));
    while(Date.now() < deadline){
        const response = await globalThis.fetch(TOKEN_URL, {
            method: 'POST',
            headers: authHeaders(),
            body: new URLSearchParams({
                grant_type: DEVICE_CODE_GRANT_TYPE,
                client_id: constants_OIDC_CLIENT_ID,
                device_code: device.device_code
            }).toString(),
            signal
        });
        if (response.ok) return await response.json();
        const body = await response.json().catch(()=>({}));
        const remaining = Math.max(0, deadline - Date.now());
        if (body.error === 'authorization_pending') {
            await (0,promises_namespaceObject.setTimeout)(Math.min(intervalMs + (/* inlined export .OAUTH_POLLING_SAFETY_MARGIN_MS */3000), remaining), undefined, {
                signal
            });
            continue;
        }
        if (body.error === 'slow_down') {
            intervalMs += (/* inlined export .DEVICE_CODE_SLOW_DOWN_INCREMENT_MS */5000);
            await (0,promises_namespaceObject.setTimeout)(Math.min(intervalMs + (/* inlined export .OAUTH_POLLING_SAFETY_MARGIN_MS */3000), remaining), undefined, {
                signal
            });
            continue;
        }
        if (body.error === 'access_denied' || body.error === 'authorization_denied') {
            throw new Error('xAI device authorization was denied');
        }
        if (body.error === 'expired_token') throw new Error('xAI device code expired; run login again');
        const detail = body.error_description ?? body.error ?? '';
        throw new Error(`xAI device token exchange failed (${response.status})${detail ? `: ${detail}` : ''}`);
    }
    throw new Error('xAI device authorization timed out');
}
function credentialsFromTokenResponse(tokens, previous) {
    if (!tokens.access_token) throw new Error('xAI token response is missing access_token');
    if (!tokens.refresh_token && !previous?.refresh) throw new Error('xAI token response is missing refresh_token');
    return credentialsFromTokens({
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token ?? previous?.refresh ?? '',
        ...typeof tokens.expires_in === 'number' ? {
            expiresInSeconds: tokens.expires_in
        } : {},
        ...tokens.id_token === undefined ? {} : {
            idToken: tokens.id_token
        }
    }, previous);
}
async function refreshAccessToken(credentials, signal) {
    if (!credentials.refresh) throw new Error('xAI token refresh requires a refresh_token');
    const params = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: credentials.refresh,
        client_id: constants_OIDC_CLIENT_ID
    });
    if (credentials.principalType) params.set('principal_type', credentials.principalType);
    if (credentials.principalId) params.set('principal_id', credentials.principalId);
    const response = await globalThis.fetch(TOKEN_URL, {
        method: 'POST',
        headers: authHeaders(),
        body: params.toString(),
        signal
    });
    if (!response.ok) {
        const detail = await responseText(response);
        throw new Error(`xAI token refresh failed (${response.status})${detail ? `: ${detail}` : ''}`);
    }
    return credentialsFromTokenResponse(await response.json(), credentials);
}
async function loginWithDeviceCode(signal) {
    const device = await requestDeviceCode(signal);
    return credentialsFromTokenResponse(await pollDeviceCodeToken(device, signal));
}

;// CONCATENATED MODULE: ./src/grok-usage.ts
// ABOUTME: Parses the SuperGrok credits payload from cli-chat-proxy billing.
// ABOUTME: The plugin page renders this view; it does not draw a terminal usage bar.

const USAGE_WARN_PERCENT = 70;
const USAGE_ERROR_PERCENT = 90;
const PERCENT_MIN = 0;
const PERCENT_MAX = 100;
const CENTS_PER_DOLLAR = 100;
const MS_PER_SECOND = 1000;
const SECONDS_PER_DAY = 86400;
const SECONDS_PER_HOUR = 3600;
const SECONDS_PER_MINUTE = 60;
function usageTone(percent) {
    if (percent >= USAGE_ERROR_PERCENT) return 'error';
    if (percent >= USAGE_WARN_PERCENT) return 'warning';
    return 'success';
}
function parseGrokPlanUsage(raw, now) {
    const root = isPlainObject(raw) ? raw : undefined;
    const config = pickObject(root, 'config') ?? root;
    const subscriptionTier = grok_usage_firstString(root?.['subscriptionTier'] ?? root?.['subscription_tier'] ?? config?.['subscriptionTier']);
    const onDemandEnabled = typeof root?.['onDemandEnabled'] === 'boolean' ? root['onDemandEnabled'] : undefined;
    const creditPctRaw = config?.['creditUsagePercent'] ?? config?.['credit_usage_percent'];
    const monthlyLimit = centVal(config?.['monthlyLimit'] ?? config?.['monthly_limit']);
    const used = centVal(config?.['used']);
    const hasCreditPct = isFiniteNumber(creditPctRaw);
    const usagePct = hasCreditPct ? clampPercent(creditPctRaw) : monthlyLimit !== undefined && monthlyLimit > 0 && used !== undefined ? clampPercent(used / monthlyLimit * PERCENT_MAX) : 0;
    const currentPeriod = pickObject(config, 'currentPeriod') ?? pickObject(config, 'current_period');
    const periodTypeRaw = grok_usage_firstString(currentPeriod?.['type'] ?? currentPeriod?.['period_type'] ?? currentPeriod?.['periodType']);
    const periodEndIso = grok_usage_firstString(currentPeriod?.['end']) ?? grok_usage_firstString(config?.['billingPeriodEnd'] ?? config?.['billing_period_end']);
    const resetsIn = periodEndIso === undefined ? undefined : remainingFromIso(periodEndIso, now);
    const periodEndDisplay = periodEndIso === undefined ? undefined : formatPeriodEnd(periodEndIso);
    const onDemandCap = centVal(config?.['onDemandCap'] ?? config?.['on_demand_cap']);
    const onDemandUsed = centVal(config?.['onDemandUsed'] ?? config?.['on_demand_used']);
    const prepaidBalance = centVal(config?.['prepaidBalance'] ?? config?.['prepaid_balance']);
    const payAsYouGo = (onDemandCap ?? 0) > 0;
    const onDemandUsedCents = onDemandUsed ?? (used !== undefined && monthlyLimit !== undefined ? Math.max(0, used - monthlyLimit) : undefined);
    let effectiveUsagePct = usagePct;
    if (payAsYouGo && onDemandCap !== undefined && onDemandCap > 0) {
        if (usagePct >= PERCENT_MAX && onDemandUsedCents !== undefined) {
            effectiveUsagePct = clampPercent(onDemandUsedCents / onDemandCap * PERCENT_MAX);
        } else if (!hasCreditPct && monthlyLimit !== undefined && used !== undefined) {
            const totalBudget = monthlyLimit + onDemandCap;
            effectiveUsagePct = totalBudget > 0 ? clampPercent(used / totalBudget * PERCENT_MAX) : 0;
        }
    }
    const isUnifiedBillingUser = typeof config?.['isUnifiedBillingUser'] === 'boolean' ? config['isUnifiedBillingUser'] : typeof config?.['is_unified_billing_user'] === 'boolean' ? config['is_unified_billing_user'] : undefined;
    const productUsage = parseProductUsage(config?.['productUsage'] ?? config?.['product_usage']);
    const windows = hasCreditPct || monthlyLimit !== undefined && used !== undefined || prepaidBalance !== undefined ? [
        {
            usedPercent: usagePct,
            label: periodLabel(periodTypeRaw),
            resetsIn
        }
    ] : [];
    const usable = windows.length > 0 || subscriptionTier !== undefined || prepaidBalance !== undefined || payAsYouGo || onDemandEnabled !== undefined || productUsage.length > 0;
    return {
        subscriptionTier,
        usagePct,
        effectiveUsagePct,
        periodType: periodTypeRaw,
        periodEndIso,
        periodEndDisplay,
        payAsYouGo,
        onDemandEnabled,
        onDemandCapCents: onDemandCap,
        onDemandUsedCents,
        prepaidBalanceCents: prepaidBalance,
        isUnifiedBillingUser,
        productUsage,
        windows,
        usable
    };
}
/** Map a parsed plan into the labels and meters the Plugins page shows. */ function grokUsageView(usage) {
    if (!usage.usable) return undefined;
    const window = usage.windows[0];
    const periodBits = [];
    if (usage.periodType !== undefined) periodBits.push(formatPeriodType(usage.periodType));
    if (usage.periodEndDisplay !== undefined) periodBits.push(`${usage.periodEndDisplay} 结束`);
    const onDemand = usage.payAsYouGo || usage.onDemandEnabled === true ? formatOnDemand(usage.onDemandUsedCents ?? 0, usage.onDemandCapCents) : undefined;
    const periodKind = periodKindOf(usage.periodType);
    return {
        ...usage.subscriptionTier === undefined ? {} : {
            tier: formatTier(usage.subscriptionTier)
        },
        ...window === undefined ? {} : {
            credits: {
                percent: window.usedPercent,
                tone: usageTone(window.usedPercent),
                ...window.resetsIn === undefined ? {} : {
                    resetsIn: formatRemainingZh(window.resetsIn),
                    resetsCompact: window.resetsIn
                }
            }
        },
        ...periodBits.length === 0 ? {} : {
            period: periodBits.join(' · ')
        },
        ...periodKind === undefined ? {} : {
            periodKind
        },
        ...usage.periodEndIso === undefined ? {} : {
            periodEnd: usage.periodEndIso
        },
        ...usage.prepaidBalanceCents === undefined ? {} : {
            prepaid: formatCentsUsd(usage.prepaidBalanceCents)
        },
        ...onDemand === undefined ? {} : {
            onDemand
        },
        onDemandDisabled: usage.onDemandEnabled === false,
        ...usage.payAsYouGo && usage.usagePct >= PERCENT_MAX ? {
            effective: {
                percent: usage.effectiveUsagePct,
                tone: usageTone(usage.effectiveUsagePct)
            }
        } : {},
        unified: usage.isUnifiedBillingUser === true,
        products: usage.productUsage.map((product)=>({
                label: product.label,
                percent: product.usagePct,
                tone: usageTone(product.usagePct)
            }))
    };
}
async function fetchGrokUsage(credentials, signal, now = Date.now()) {
    const timeout = AbortSignal.timeout((/* inlined export .USAGE_FETCH_TIMEOUT_MS */12000));
    const response = await globalThis.fetch(BILLING_URL, {
        method: 'GET',
        headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${credentials.access}`,
            'X-XAI-Token-Auth': TOKEN_AUTH_VALUE,
            'x-grok-client-version': (/* inlined export .GROK_CLIENT_VERSION */"1.0.46"),
            'x-grok-client-identifier': CLIENT_IDENTIFIER,
            'x-grok-client-mode': CLIENT_MODE_VALUE,
            ...credentials.userId === undefined ? {} : {
                'x-userid': credentials.userId
            }
        },
        signal: signal === undefined ? timeout : AbortSignal.any([
            signal,
            timeout
        ])
    });
    if (!response.ok) throw new Error(`xAI usage request failed (${response.status})`);
    return grokUsageView(parseGrokPlanUsage(await response.json(), now));
}
function formatOnDemand(usedCents, capCents) {
    const used = formatCentsUsd(usedCents);
    return capCents === undefined ? used : `${used} / ${formatCentsUsd(capCents)}`;
}
function formatRemainingZh(compact) {
    if (compact === 'due') return '已到重置时间';
    if (compact === '<1m') return '不足 1 分钟';
    return compact.replace(/(\d+)d/g, '$1 天').replace(/(\d+)h/g, '$1 小时').replace(/(\d+)m/g, '$1 分钟');
}
function centVal(value) {
    if (isFiniteNumber(value)) return Math.trunc(value);
    if (!isPlainObject(value)) return undefined;
    const raw = value['val'] ?? value['value'];
    return isFiniteNumber(raw) ? Math.trunc(raw) : undefined;
}
function grok_usage_firstString(value) {
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
}
function remainingFromIso(iso, now) {
    const end = Date.parse(iso);
    if (!Number.isFinite(end)) return undefined;
    return formatRemaining(end - now);
}
function formatRemaining(ms) {
    if (!Number.isFinite(ms)) return undefined;
    if (ms <= 0) return 'due';
    const totalSeconds = Math.floor(ms / MS_PER_SECOND);
    const days = Math.floor(totalSeconds / SECONDS_PER_DAY);
    const hours = Math.floor(totalSeconds % SECONDS_PER_DAY / SECONDS_PER_HOUR);
    const minutes = Math.floor(totalSeconds % SECONDS_PER_HOUR / SECONDS_PER_MINUTE);
    if (days > 0) return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
    if (hours > 0) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
    if (minutes > 0) return `${minutes}m`;
    return '<1m';
}
function formatPeriodEnd(iso) {
    const end = Date.parse(iso);
    if (!Number.isFinite(end)) return undefined;
    try {
        return new Intl.DateTimeFormat('zh-CN', {
            month: 'numeric',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        }).format(new Date(end));
    } catch  {
        return iso;
    }
}
function periodKindOf(periodType) {
    if (periodType === undefined) return undefined;
    const upper = periodType.toUpperCase();
    if (upper.includes('WEEK')) return 'week';
    if (upper.includes('MONTH')) return 'month';
    if (upper.includes('DAY')) return 'day';
    return undefined;
}
function periodLabel(periodType) {
    if (periodType === undefined) return 'Credits';
    const normalized = periodType.toUpperCase();
    if (normalized.includes('WEEK')) return 'W';
    if (normalized.includes('MONTH')) return 'M';
    if (normalized.includes('DAY')) return 'D';
    return 'Credits';
}
function formatPeriodType(periodType) {
    const normalized = periodType.replace(/^USAGE_PERIOD_TYPE_/i, '');
    const upper = normalized.toUpperCase();
    if (upper.includes('WEEK')) return '每周';
    if (upper.includes('MONTH')) return '每月';
    if (upper.includes('DAY')) return '每天';
    return formatSnakeCase(normalized.toLowerCase());
}
function formatTier(tier) {
    if (/\s/.test(tier)) return tier;
    return tier.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
}
function formatCentsUsd(cents) {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 2
    }).format(cents / CENTS_PER_DOLLAR);
}
function formatSnakeCase(value) {
    return value.split(/[_\s]+/).filter((part)=>part.length > 0).map((part)=>part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()).join(' ');
}
function parseProductUsage(raw) {
    if (!Array.isArray(raw)) return [];
    const items = [];
    for (const entry of raw){
        if (!isPlainObject(entry)) continue;
        const pctRaw = entry['usagePercent'] ?? entry['usage_percent'];
        if (!isFiniteNumber(pctRaw)) continue;
        const product = grok_usage_firstString(entry['product'] ?? entry['product_type'] ?? entry['name']);
        const label = grok_usage_firstString(entry['label'] ?? entry['displayName'] ?? entry['display_name']) ?? formatProductLabel(product);
        if (label === undefined) continue;
        items.push({
            label,
            product,
            usagePct: clampPercent(pctRaw)
        });
    }
    items.sort((a, b)=>b.usagePct - a.usagePct || a.label.localeCompare(b.label));
    return items;
}
function formatProductLabel(product) {
    if (product === undefined) return undefined;
    const known = {
        PRODUCT_API: 'API',
        PRODUCT_XAI_API: 'API',
        PRODUCT_GROK_API: 'API',
        PRODUCT_GROK_BUILD: 'Build',
        PRODUCT_BUILD: 'Build',
        PRODUCT_CHAT: 'Chat',
        PRODUCT_GROK_CHAT: 'Chat',
        PRODUCT_IMAGINE: 'Imagine',
        PRODUCT_GROK_IMAGINE: 'Imagine',
        PRODUCT_VOICE: 'Voice',
        PRODUCT_GROK_VOICE: 'Voice'
    };
    const upper = product.trim().toUpperCase();
    const named = known[upper];
    if (named !== undefined) return named;
    const stripped = upper.replace(/^PRODUCT_/, '').replace(/^GROK_/, '').replace(/_/g, ' ').trim();
    if (stripped.length === 0) return undefined;
    return stripped.split(/\s+/).map((part)=>part === 'API' ? 'API' : part.charAt(0) + part.slice(1).toLowerCase()).join(' ');
}
function clampPercent(value) {
    return Math.max(PERCENT_MIN, Math.min(PERCENT_MAX, value));
}
function isPlainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function isFiniteNumber(value) {
    return typeof value === 'number' && Number.isFinite(value);
}
function pickObject(value, key) {
    if (!isPlainObject(value)) return undefined;
    const inner = value[key];
    return isPlainObject(inner) ? inner : undefined;
}

;// CONCATENATED MODULE: external "node:crypto"
const external_node_crypto_namespaceObject = __rspack_createRequire_require("node:crypto");
;// CONCATENATED MODULE: external "@earendil-works/pi-ai/models"

;// CONCATENATED MODULE: external "@earendil-works/pi-ai/api/openai-responses.lazy"

;// CONCATENATED MODULE: ./src/wire.ts
// ABOUTME: Builds the SuperGrok pi-ai provider and applies the cli-chat-proxy request contract.
// ABOUTME: Product headers and Responses body alignment run for every stream, including subagents.












const RESPONSES = openAIResponsesApi();
const RESPONSES_COMPAT = {
    supportsDeveloperRole: false,
    sessionAffinityFormat: 'openai-nosession',
    supportsLongCacheRetention: false
};
function platformOs() {
    switch(process.platform){
        case 'darwin':
            return 'macos';
        case 'win32':
            return 'windows';
        default:
            return process.platform;
    }
}
function platformArch() {
    switch(process.arch){
        case 'arm64':
            return 'aarch64';
        case 'x64':
            return 'x86_64';
        default:
            return process.arch;
    }
}
function grokUserAgent() {
    return `${CLIENT_IDENTIFIER}/${(/* inlined export .GROK_CLIENT_VERSION */"1.0.46")} (${platformOs()}; ${platformArch()})`;
}
function readAgentIdFile(path) {
    try {
        const cached = (0,external_node_fs_namespaceObject.readFileSync)(path, 'utf8').trim();
        return cached.length > 0 ? cached : undefined;
    } catch  {
        return undefined;
    }
}
function resolveAgentId() {
    const fromGrok = readAgentIdFile(grokAgentIdPath());
    if (fromGrok) return fromGrok;
    const ownedPath = agentIdPath();
    const owned = readAgentIdFile(ownedPath);
    if (owned) return owned;
    const host = (0,external_node_os_namespaceObject.hostname)();
    const id = host.length > 0 ? (0,external_node_crypto_namespaceObject.createHash)('sha1').update(`agent_id:${host}`).digest('hex').replace(/^(.{8})(.{4})(.{4})(.{4})(.{12}).*$/, '$1-$2-$3-$4-$5') : (0,external_node_crypto_namespaceObject.randomUUID)();
    try {
        (0,external_node_fs_namespaceObject.mkdirSync)((0,external_node_path_namespaceObject.dirname)(ownedPath), {
            recursive: true
        });
        const tmp = `${ownedPath}.tmp.${process.pid}.${Date.now()}`;
        (0,external_node_fs_namespaceObject.writeFileSync)(tmp, `${id}\n`, {
            encoding: 'utf8',
            mode: 384
        });
        (0,external_node_fs_namespaceObject.renameSync)(tmp, ownedPath);
    } catch  {
    // The header can still use the in-memory id when the cache file cannot be written.
    }
    return id;
}
let agentId;
function getAgentId() {
    agentId ??= resolveAgentId();
    return agentId;
}
function isCliChatProxyUrl(url) {
    if (!url) return false;
    try {
        const host = new URL(url).hostname;
        return host === 'cli-chat-proxy.grok.com' || host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
    } catch  {
        return false;
    }
}
function productHeaders() {
    return {
        'x-grok-client-version': (/* inlined export .GROK_CLIENT_VERSION */"1.0.46"),
        [CLIENT_IDENTIFIER_HEADER]: CLIENT_IDENTIFIER,
        [CLIENT_MODE_HEADER]: CLIENT_MODE_VALUE
    };
}
/** Model discovery uses its own identity header, not the sampling request headers. */ function catalogHeaders(credentials, etag) {
    const userId = resolveGrokUserId(credentials.access, credentials);
    return {
        Accept: 'application/json',
        Authorization: `Bearer ${credentials.access}`,
        [TOKEN_AUTH_HEADER]: TOKEN_AUTH_VALUE,
        'x-grok-client-version': (/* inlined export .GROK_CLIENT_VERSION */"1.0.46"),
        [CLIENT_MODE_HEADER]: CLIENT_MODE_VALUE,
        ...userId === undefined ? {} : {
            'x-userid': userId
        },
        ...credentials.email === undefined ? {} : {
            'x-email': credentials.email
        },
        ...etag === undefined ? {} : {
            'If-None-Match': etag
        }
    };
}
/** grok-shell prefix first so the proxy can recognize the client; Harness attribution stays on the same header. */ function subscriptionUserAgent() {
    return `${grokUserAgent()} ${attributionHeaders()['user-agent']}`;
}
function subscriptionHeaders(model, options, credentials) {
    const headers = {};
    for (const source of [
        model.headers,
        options.headers
    ]){
        for (const [name, value] of Object.entries(source ?? {}))headers[name.toLowerCase()] = value;
    }
    delete headers['user-agent'];
    Object.assign(headers, productHeaders());
    headers['user-agent'] = subscriptionUserAgent();
    const sessionId = options.sessionId || (typeof headers[SESSION_ID_HEADER] === 'string' ? headers[SESSION_ID_HEADER] : '') || (0,external_node_crypto_namespaceObject.randomUUID)();
    const authorization = headers.authorization;
    const accessToken = authorization === undefined ? options.apiKey : authorization?.trim().match(/^Bearer\s+(.+)$/i)?.[1];
    const proxy = isCliChatProxyUrl(model.baseUrl);
    headers['x-grok-conv-id'] = headers['x-grok-conv-id'] || sessionId;
    headers['x-grok-req-id'] = `xai-perm-auto-${(0,external_node_crypto_namespaceObject.randomUUID)()}`;
    headers[SESSION_ID_HEADER] = sessionId;
    headers[MODEL_OVERRIDE_HEADER] = model.id;
    headers['x-grok-agent-id'] = getAgentId();
    headers[USER_ID_HEADER] = proxy ? resolveGrokUserId(accessToken, credentials) ?? null : null;
    headers[TOKEN_AUTH_HEADER] = proxy ? TOKEN_AUTH_VALUE : null;
    headers[AUTHENTICATE_RESPONSE_HEADER] = proxy ? AUTHENTICATE_RESPONSE_VALUE : null;
    headers.session_id = null;
    return headers;
}
function catalogToModel(entry, baseUrl) {
    const thinkingLevelMap = thinkingLevelMapForCatalog(entry);
    return {
        id: entry.id,
        name: entry.name,
        api: 'openai-responses',
        provider: 'xai-supergrok',
        baseUrl,
        reasoning: entry.reasoning,
        ...thinkingLevelMap === undefined ? {} : {
            thinkingLevelMap
        },
        input: [
            ...entry.input
        ],
        cost: {
            ...entry.cost
        },
        contextWindow: entry.contextWindow,
        maxTokens: entry.maxTokens,
        compat: {
            ...RESPONSES_COMPAT
        }
    };
}
function streamSuperGrok(model, context, options, credentials) {
    const requestModel = {
        ...model,
        api: 'openai-responses',
        provider: model.provider,
        baseUrl: model.baseUrl,
        headers: undefined,
        compat: {
            ...model.compat,
            ...RESPONSES_COMPAT
        }
    };
    const requestOptions = {
        ...options,
        headers: subscriptionHeaders(model, options, credentials),
        onPayload: async (payload, payloadModel)=>{
            const aligned = alignGrokBuildResponsesPayload(payload, model.id);
            const replacement = await options.onPayload?.(aligned, payloadModel);
            return alignGrokBuildResponsesPayload(replacement === undefined ? aligned : replacement, model.id);
        }
    };
    const needsApiStream = 'reasoningEffort' in options || 'reasoningSummary' in options || 'serviceTier' in options;
    if (!needsApiStream) return RESPONSES.streamSimple(requestModel, context, requestOptions);
    if (options.reasoningEffort === undefined && options.reasoning !== undefined) {
        const reasoning = clampThinkingLevel(requestModel, options.reasoning);
        // The SDK enables medium effort for a summary alone; keep a clamped off level off.
        if (reasoning === 'off') requestOptions.reasoningSummary = null;
        else requestOptions.reasoningEffort = reasoning;
    }
    return RESPONSES.stream(requestModel, context, requestOptions);
}
function asStreamOptions(options) {
    return options ?? {};
}
function createSuperGrokProvider(models, credentials) {
    const listed = models;
    return {
        id: 'xai-supergrok',
        name: 'xAI SuperGrok',
        baseUrl: listed[0]?.baseUrl ?? CLI_CHAT_PROXY_BASE_URL,
        auth: {
            apiKey: {
                name: 'xAI SuperGrok subscription',
                resolve: ({ credential })=>Promise.resolve(credential?.key === undefined ? undefined : {
                        auth: {
                            apiKey: credential.key
                        },
                        source: 'xAI SuperGrok'
                    })
            }
        },
        getModels: ()=>listed,
        stream: (model, context, options)=>streamSuperGrok(model, context, asStreamOptions(options), credentials()),
        streamSimple: (model, context, options)=>streamSuperGrok(model, context, options ?? {}, credentials())
    };
}

;// CONCATENATED MODULE: ./src/runtime.ts
// ABOUTME: Owns the SuperGrok credential, model catalog, and pi-ai adapter profile.
// ABOUTME: Each request refreshes an expired access token under the credential-store lock.










const CREDENTIAL_KEY = credentialKey(PLUGIN_NAME, PROVIDER_ID);
function grantRecord(credentials) {
    return {
        kind: 'grant',
        payload: credentials
    };
}
function credentialsFromRecord(record) {
    if (record?.kind !== 'grant' || !isSuperGrokCredentials(record.payload)) return undefined;
    return record.payload;
}
class SuperGrokRuntime {
    models = [
        ...FALLBACK_CATALOG
    ];
    version = 0;
    profiles;
    profileVersion = -1;
    latest;
    loginAbort;
    pending;
    loginError;
    usageCache;
    usageError;
    usageInflight;
    usageGeneration = 0;
    adapter;
    ctx;
    constructor(ctx){
        this.ctx = ctx;
        const cached = loadModelsCatalog(modelsListUrl(oauthBaseUrl()));
        if (cached !== undefined) this.models = cached.models;
        const options = {
            profiles: ()=>this.profileMap(),
            resolveApiKey: async ()=>this.resolveAccessToken(),
            auth: {
                credentials: {
                    read: ()=>Promise.resolve(undefined),
                    list: ()=>Promise.resolve([]),
                    modify: (_providerId, mutate)=>mutate(undefined),
                    delete: ()=>Promise.resolve()
                },
                authContext: {
                    env: ()=>Promise.resolve(undefined),
                    fileExists: ()=>Promise.resolve(false)
                }
            },
            resolveAttachments: ()=>this.ctx.get('attachments'),
            resolveImageAccess: (attachments, ref)=>resolveImageAttachmentAccess(attachments, (hostPath)=>this.ctx.get('fs')?.processPathFromHostPath(hostPath), ref)
        };
        this.adapter = new PiAiAdapter(options);
    }
    currentModels() {
        return this.models;
    }
    profileMap() {
        if (this.profiles !== undefined && this.profileVersion === this.version) return this.profiles;
        const baseUrl = oauthBaseUrl();
        const piModels = this.models.map((entry)=>catalogToModel(entry, baseUrl));
        const profile = {
            provider: PROVIDER_ID,
            displayName: PROVIDER_LABEL,
            baseURL: baseUrl,
            api: 'openai-responses',
            streamIdleTimeoutMs: (/* inlined export .STREAM_IDLE_TIMEOUT_MS */300000),
            maxRequestImageBytes: MAX_REQUEST_IMAGE_BYTES,
            requestImagePixelBudget: REQUEST_IMAGE_PIXEL_BUDGET,
            requestImageMaxBytes: REQUEST_IMAGE_MAX_BYTES,
            retryPolicy: resolveRetryPolicy(undefined, 'dsh-xai-auth retryPolicy'),
            piProvider: createSuperGrokProvider(piModels, ()=>this.latest),
            modelErrors: new Map(),
            configuredMaxTokens: new Map()
        };
        this.profiles = new Map([
            [
                PROVIDER_ID,
                profile
            ]
        ]);
        this.profileVersion = this.version;
        return this.profiles;
    }
    replaceModels(next, announce = false) {
        if (next.length === 0) return;
        const previous = this.models.map((model)=>model.id).join('\n');
        this.models = [
            ...next
        ];
        this.version += 1;
        this.profiles = undefined;
        if (previous === this.models.map((model)=>model.id).join('\n') && !announce) return;
        // dsh 0.2.1 refreshes the picker on adapter updates.
        this.ctx.emit('llm/adapters-updated');
    }
    async resolveAccessToken(signal) {
        const previousAccess = this.latest?.access;
        const ready = await this.resolveCredentials(signal);
        if (ready.access !== previousAccess) void this.warmCatalog(ready);
        return ready.access;
    }
    async resolveCredentials(signal) {
        const credentials = this.ctx.get('credentials');
        if (credentials === undefined) {
            throw new LlmError('xAI SuperGrok needs the credentials service to store the subscription sign-in', 'NO_CREDENTIAL_STORE');
        }
        const stored = await credentials.modifyRecord(CREDENTIAL_KEY, async (current)=>{
            const existing = credentialsFromRecord(current);
            if (existing === undefined) return undefined;
            if (!isCredentialExpired(existing)) return undefined;
            const refreshed = await refreshAccessToken(existing, signal);
            return grantRecord(refreshed);
        });
        const ready = credentialsFromRecord(stored);
        if (ready === undefined) {
            throw new LlmError('Sign in to xAI SuperGrok on the Plugins page for dsh-xai-auth.', 'MISSING_CREDENTIAL');
        }
        this.latest = ready;
        return ready;
    }
    async warmCatalog(credentials, signal, announce = false) {
        const baseUrl = oauthBaseUrl();
        const origin = modelsListUrl(baseUrl);
        const previous = loadModelsCatalog(origin);
        try {
            const response = await globalThis.fetch(origin, {
                method: 'GET',
                headers: catalogHeaders(credentials, announce ? undefined : previous?.etag),
                signal
            });
            if (response.status === 304 && previous !== undefined) {
                this.replaceModels(previous.models, announce);
                return;
            }
            if (!response.ok) throw new Error(`xAI models catalog request failed (${response.status})`);
            const models = parseRemoteModels(await response.json());
            if (models.length === 0) throw new Error('xAI models catalog returned no models');
            const etag = response.headers.get('etag') ?? undefined;
            saveModelsCatalog(models, {
                origin,
                ...etag === undefined ? {} : {
                    etag
                }
            });
            this.replaceModels(models, announce);
        } catch (error) {
            this.ctx.logger.warn('dsh-xai-auth: model catalog refresh failed; keeping the cached list');
            this.ctx.logger.warn(error);
            if (previous !== undefined) this.replaceModels(previous.models);
            if (announce) throw error;
        }
    }
    /** Load a stored grant and refresh its catalog. Missing sign-in is not an error. */ async restore() {
        const credentials = this.ctx.get('credentials');
        if (credentials === undefined) return;
        const existing = credentialsFromRecord(await credentials.readRecord(CREDENTIAL_KEY));
        if (existing === undefined) return;
        this.latest = existing;
        if (isCredentialExpired(existing)) {
            await this.resolveAccessToken();
            return;
        }
        await this.warmCatalog(existing);
    }
    /** The sign-in the Plugins page shows. Pending device login survives only until this process exits. */ accountStatus() {
        const account = this.latest === undefined ? undefined : describeGrokAuthSession(this.latest);
        if (this.latest !== undefined) this.refreshUsageSoon();
        const pending = this.usageInflight !== undefined && this.usageCache === undefined;
        return {
            signedIn: this.latest !== undefined,
            models: this.models.map((model)=>model.id),
            ...account === undefined ? {} : {
                account
            },
            ...this.pending === undefined ? {} : {
                pending: this.pending
            },
            ...this.loginError === undefined ? {} : {
                error: this.loginError
            },
            ...this.usageCache === undefined ? {} : {
                usage: this.usageCache.view
            },
            ...this.usageError === undefined ? {} : {
                usageError: this.usageError
            },
            ...pending ? {
                usagePending: true
            } : {}
        };
    }
    /** Start one billing read when the cached meter is missing or stale. */ refreshUsageSoon() {
        if (this.usageInflight !== undefined) return;
        if (this.usageCache !== undefined && Date.now() - this.usageCache.at < (/* inlined export .USAGE_CACHE_TTL_MS */120000)) return;
        const generation = this.usageGeneration;
        this.usageInflight = this.planUsage().then((result)=>{
            if (generation !== this.usageGeneration) return;
            if (result.usage !== undefined) this.usageCache = {
                at: Date.now(),
                view: result.usage
            };
            this.usageError = result.error;
        }, (error)=>{
            if (generation !== this.usageGeneration) return;
            this.usageError = error instanceof Error ? error.message : 'xAI usage request failed';
        }).finally(()=>{
            if (generation === this.usageGeneration) this.usageInflight = undefined;
        });
    }
    async storedCredentials() {
        if (this.latest !== undefined) return this.latest;
        const credentials = this.ctx.get('credentials');
        if (credentials === undefined) return undefined;
        return credentialsFromRecord(await credentials.readRecord(CREDENTIAL_KEY));
    }
    /** Read the subscription meter. A fresh result is reused until the cache expires. */ async planUsage() {
        const ready = await this.storedCredentials();
        if (ready === undefined) return {};
        this.latest = ready;
        const cached = this.usageCache;
        if (cached !== undefined && Date.now() - cached.at < (/* inlined export .USAGE_CACHE_TTL_MS */120000)) return {
            usage: cached.view
        };
        try {
            const access = await this.resolveAccessToken();
            const view = await fetchGrokUsage({
                access,
                ...this.latest?.userId === undefined ? {} : {
                    userId: this.latest.userId
                }
            });
            if (view === undefined) return {
                ...cached === undefined ? {} : {
                    usage: cached.view
                },
                error: 'xAI returned no SuperGrok usage.'
            };
            return {
                usage: view
            };
        } catch (error) {
            const message = error instanceof Error ? error.message : 'xAI usage request failed';
            return {
                ...cached === undefined ? {} : {
                    usage: cached.view
                },
                error: message
            };
        }
    }
    /** Fetch the live catalog and tell the model picker to reload it. */ async refreshModels() {
        const ready = await this.resolveCredentials();
        await this.warmCatalog(ready, undefined, true);
        return {
            models: this.models.map((model)=>model.id)
        };
    }
    /** Return the device challenge immediately and finish the grant in the background. */ async startDeviceLogin() {
        this.loginAbort?.abort();
        const abort = new AbortController();
        this.loginAbort = abort;
        this.loginError = undefined;
        const device = await requestDeviceCode(abort.signal);
        const instructions = deviceInstructions(device);
        this.pending = instructions;
        void pollDeviceCodeToken(device, abort.signal).then((tokens)=>credentialsFromTokenResponse(tokens)).then((credentials)=>this.store(credentials, abort.signal)).then((credentials)=>{
            this.pending = undefined;
            this.ctx.logger.info(`dsh-xai-auth: SuperGrok sign-in stored for ${describeGrokAuthSession(credentials)}`);
        }).catch((error)=>{
            if (abort.signal.aborted) return;
            this.pending = undefined;
            this.loginError = error instanceof Error ? error.message : 'xAI SuperGrok device sign-in failed';
            this.ctx.logger.warn('dsh-xai-auth: SuperGrok device sign-in failed');
            this.ctx.logger.warn(error);
        });
        return instructions;
    }
    cancelLogin() {
        this.loginAbort?.abort();
        this.loginAbort = undefined;
        this.pending = undefined;
        this.loginError = undefined;
    }
    async signOut() {
        this.cancelLogin();
        this.latest = undefined;
        this.usageGeneration += 1;
        this.usageCache = undefined;
        this.usageError = undefined;
        this.usageInflight = undefined;
        const credentials = this.ctx.get('credentials');
        if (credentials === undefined) return;
        await credentials.deleteRecord(CREDENTIAL_KEY);
    }
    async store(credentials, signal) {
        const service = this.ctx.get('credentials');
        if (service === undefined) throw new Error('xAI SuperGrok needs the credentials service to store the sign-in');
        this.latest = credentials;
        this.usageGeneration += 1;
        this.usageCache = undefined;
        this.usageError = undefined;
        this.usageInflight = undefined;
        await this.warmCatalog(credentials, signal);
        await service.modifyRecord(CREDENTIAL_KEY, ()=>Promise.resolve(grantRecord(credentials)));
        return credentials;
    }
}

;// CONCATENATED MODULE: ./src/auth-service.ts
// ABOUTME: Exposes SuperGrok sign-in to the Plugins page over the host Remote gateway.
// ABOUTME: Methods are marked without decorators so Node can load this file by stripping types.



const REMOTE_METHODS = '@deepseek-ai/dsh-typert-protocol/remote-methods';
function exposeRemoteMethod(prototype, method) {
    const property = Object.getOwnPropertyDescriptor(prototype, REMOTE_METHODS);
    const previous = property?.value;
    const methods = Array.isArray(previous?.methods) ? previous.methods : [];
    Object.defineProperty(prototype, REMOTE_METHODS, {
        configurable: true,
        value: Object.freeze({
            version: 1,
            methods: Object.freeze([
                ...methods,
                Object.freeze({
                    method,
                    invocation: Object.freeze({
                        kind: 'direct'
                    })
                })
            ])
        })
    });
}
/** Host Remote `xaiSupergrok/*` for the plugin configuration page. */ class SuperGrokAuthService extends TypertRemoteService {
    static inject = [
        'llm'
    ];
    runtime;
    constructor(ctx){
        super(ctx, 'xaiSupergrok');
        this.runtime = new SuperGrokRuntime(ctx);
        ctx.llm.registerAdapter([
            PROVIDER_ID
        ], this.runtime.adapter);
        ctx.llm.registerConfigurableProviders([
            {
                provider: PROVIDER_ID,
                displayName: PROVIDER_LABEL,
                settingsNs: PLUGIN_NAME,
                settingsPath: [],
                declared: true,
                defaultBaseURL: 'https://cli-chat-proxy.grok.com/v1',
                nativeAuth: {
                    env: [],
                    oauth: true
                }
            }
        ]);
        void this.runtime.restore().catch((error)=>{
            ctx.logger.warn('dsh-xai-auth: could not restore the SuperGrok sign-in');
            ctx.logger.warn(error);
        });
    }
    status() {
        return this.runtime.accountStatus();
    }
    start() {
        return this.runtime.startDeviceLogin();
    }
    cancel() {
        this.runtime.cancelLogin();
        return {
            cancelled: true
        };
    }
    async signOut() {
        await this.runtime.signOut();
        return {
            signedOut: true
        };
    }
    refreshModels() {
        return this.runtime.refreshModels();
    }
}
exposeRemoteMethod(SuperGrokAuthService.prototype, 'status');
exposeRemoteMethod(SuperGrokAuthService.prototype, 'start');
exposeRemoteMethod(SuperGrokAuthService.prototype, 'cancel');
exposeRemoteMethod(SuperGrokAuthService.prototype, 'signOut');
exposeRemoteMethod(SuperGrokAuthService.prototype, 'refreshModels');

;// CONCATENATED MODULE: ./src/index.ts
// ABOUTME: Registers the xAI SuperGrok subscription provider and its Plugins-page sign-in.
// ABOUTME: The route uses cli-chat-proxy OAuth and stays separate from an xAI API key.


const src_name = PLUGIN_NAME;
const inject = [
    'llm'
];
function apply(ctx) {
    ctx.plugin(SuperGrokAuthService);
}

var __webpack_exports__apply = __webpack_exports__.Bb;
var __webpack_exports__inject = __webpack_exports__.WQ;
var __webpack_exports__name = __webpack_exports__.UU;
export { __webpack_exports__apply as apply, __webpack_exports__inject as inject, __webpack_exports__name as name };
