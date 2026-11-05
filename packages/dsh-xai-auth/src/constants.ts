// ABOUTME: Fixed SuperGrok subscription endpoints, client identity, and OAuth parameters.
// ABOUTME: Values stay lockstepped with grok-build's cli-chat-proxy session path.

/** Harness route and credential id for this subscription provider. */
export const PROVIDER_ID = "xai-supergrok";

/** Plugin name and credential-record scope. */
export const PLUGIN_NAME = "dsh-xai-auth";

/** User-facing provider label. */
export const PROVIDER_LABEL = "xAI SuperGrok";

export const OIDC_ISSUER = "https://auth.x.ai";
export const OIDC_CLIENT_ID = "b1a00492-073a-47ea-816f-4c329264a828";
export const TOKEN_URL = "https://auth.x.ai/oauth2/token";
export const DEVICE_AUTHORIZATION_URL = "https://auth.x.ai/oauth2/device/code";
export const DEVICE_CODE_GRANT_TYPE = "urn:ietf:params:oauth:grant-type:device_code";

/** grok-build personal OAuth scopes for a Grok Build session. */
export const OAUTH_SCOPE =
  "openid profile email offline_access grok-cli:access api:access conversations:read conversations:write workspaces:read workspaces:write";

export const CLI_CHAT_PROXY_BASE_URL = "https://cli-chat-proxy.grok.com/v1";

/** SuperGrok subscription credits. Same route usage-bar reads for the Grok channel. */
export const BILLING_URL = `${CLI_CHAT_PROXY_BASE_URL}/billing?format=credits`;

/** How long a successful usage read stays on the Plugins page before the next fetch. */
export const USAGE_CACHE_TTL_MS = 120_000;

/** Bound one billing request so a stalled proxy cannot hold the page. */
export const USAGE_FETCH_TIMEOUT_MS = 12_000;
export const API_BASE_URL = "https://api.x.ai/v1";

/** Set to 1 to send the OAuth session to api.x.ai instead of cli-chat-proxy. */
export const ENV_OAUTH_USE_API_URL = "GROK_OAUTH_USE_API_URL";

/** Lockstepped grok-build CLI version sent as x-grok-client-version. */
export const GROK_CLIENT_VERSION = "1.0.46";
export const CLIENT_IDENTIFIER = "grok-shell";
export const CLIENT_SURFACE = "ui";
export const OAUTH_REFERRER = "grok-build";

export const TOKEN_AUTH_HEADER = "x-xai-token-auth";
export const TOKEN_AUTH_VALUE = "xai-grok-cli";
export const AUTHENTICATE_RESPONSE_HEADER = "x-authenticateresponse";
export const AUTHENTICATE_RESPONSE_VALUE = "authenticate-response";
export const CLIENT_MODE_HEADER = "x-grok-client-mode";
export const CLIENT_MODE_VALUE = "interactive";
export const CLIENT_IDENTIFIER_HEADER = "x-grok-client-identifier";
export const SESSION_ID_HEADER = "x-grok-session-id";
export const MODEL_OVERRIDE_HEADER = "x-grok-model-override";
export const USER_ID_HEADER = "x-grok-user-id";

/** Refresh this long before the access token's hard expiry. Matches grok-build. */
export const EARLY_INVALIDATION_MS = 300_000;
/** Fallback lifetime when the issuer omits expires_at. Matches grok-build TOKEN_TTL. */
export const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export const DEVICE_CODE_DEFAULT_INTERVAL_MS = 5_000;
export const DEVICE_CODE_MIN_INTERVAL_MS = 1_000;
export const DEVICE_CODE_SLOW_DOWN_INCREMENT_MS = 5_000;
export const DEVICE_CODE_DEFAULT_EXPIRES_MS = 5 * 60 * 1000;
export const OAUTH_POLLING_SAFETY_MARGIN_MS = 3_000;

/** grok-build models cache TTL. */
export const MODELS_CACHE_TTL_MS = 300_000;

export const GROK_AUTH_FILE = "auth.json";
export const GROK_BUILD_MODELS_CACHE_FILE = "models_cache.json";
export const GROK_AGENT_ID_FILE = "agent_id";
export const CACHE_DIR_NAME = "xai-supergrok";
export const MODELS_CACHE_FILE = "models-cache.json";
export const AGENT_ID_FILE = "agent-id";

/** Match dsh-llm-pi-ai profile defaults so image and idle limits stay familiar. */
export const STREAM_IDLE_TIMEOUT_MS = 300_000;
export const MAX_REQUEST_IMAGE_BYTES = 20 * 1024 * 1024;
export const MAX_REQUEST_IMAGES = 50;
export const IMAGE_OFFLOAD_COUNT_QUANTUM = 10;
export const REQUEST_IMAGE_PIXEL_BUDGET = 2048 * 2048;
export const REQUEST_IMAGE_MAX_BYTES = 1024 * 1024;

export function oauthBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const flag = env[ENV_OAUTH_USE_API_URL];
  return flag && flag !== "0" && flag !== "false" ? API_BASE_URL : CLI_CHAT_PROXY_BASE_URL;
}
