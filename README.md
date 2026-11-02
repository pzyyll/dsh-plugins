# dsh-xai-auth

dsh bundle for an xAI SuperGrok or X Premium subscription. It registers the `xai-supergrok` model route through [cli-chat-proxy](https://cli-chat-proxy.grok.com/v1). It does not use an `XAI_API_KEY`, and it does not replace the built-in `xai` API route.

## Install

From the directory that contains this package:

```sh
dsh plugin --profile <profile> add ./dsh-xai-auth
```

The running dsh release must satisfy `engines.dsh` (`>=0.2.0 <0.3.0`). The profile must mount `@deepseek-ai/dsh-llm`, `@deepseek-ai/dsh-llm-pi-ai`, credentials, and authorization. The default profile does.

## Sign in

Open **Plugins**, then open **dsh-xai-auth**. The page shows **登录**. Choose it, open the verification page, and enter the code. Approval finishes in the background. The same page shows **退出登录** after the grant is stored. **刷新模型** fetches the catalog again and reloads the model picker. The same list then shows **用量**: the subscription credit meter, period, prepaid balance, on-demand spend, and per-product share from `GET /v1/billing?format=credits`. A successful read is reused for 2 minutes. While a Session's selected model is `xai-supergrok`, the composer dock shows the same remaining percent. Choose it to open the meter.

This plugin does not import `~/.grok/auth.json` and does not register a chat command.

After sign-in, select an `xai-supergrok/...` model. The catalog comes from `GET /v1/models` on cli-chat-proxy. The cache is `$DSH_HOME/cache/xai-supergrok/models-cache.json`. If the proxy is down and no cache exists, the route offers `grok-4.5` and `grok-build`.

## Request contract

Subscription requests use OpenAI Responses on cli-chat-proxy:

- Product headers match grok-shell `1.0.46`, including `X-XAI-Token-Auth: xai-grok-cli`. `User-Agent` starts with `grok-shell/1.0.46` and keeps the Harness attribution token.
- `prompt_cache_key` and `prompt_cache_retention` are removed.
- `reasoning.summary` is `concise`. Always-on models such as `grok-composer-2.5` do not send `reasoning.effort`.
- System messages stay on the `system` role. Sticky routing uses `x-grok-session-id`, not OpenAI `session_id`.

Token refresh uses the xAI refresh grant and keeps `principal_type` / `principal_id` when the token has them. Rotated tokens stay in the dsh credential store.

Set `GROK_OAUTH_USE_API_URL=1` only to send that same OAuth session to `https://api.x.ai/v1` instead of cli-chat-proxy.

## Limits

- This package does not add a Models-page editor. Sign in on the Plugins page.
- A page reload during device approval drops the in-memory wait. Choose **登录** again.
- **退出登录** deletes credential record `dsh-xai-auth/xai-supergrok`. That does not revoke the token at xAI.
- Listed model prices are short-context API list prices. The Plugins page meter is the SuperGrok subscription, from the billing credits route.
