# dsh-xai-auth

English | [中文](README.zh-CN.md)

Use an xAI SuperGrok or X Premium subscription in dsh through [cli-chat-proxy](https://cli-chat-proxy.grok.com/v1). No `XAI_API_KEY` is needed. The built-in `xai` API route stays unchanged.

## Install

Install from GitHub:

```sh
dsh plugin --profile <profile> add github:pzyyll/dsh-xai-auth
```

The `prepare` script uses Rsbuild to build the host entry at `dist/index.js`. If pnpm blocks this build, add the exact Git dependency key from its error to `allowBuilds` in the profile's `pnpm-workspace.yaml`, then run the install command again.

For a local checkout, install [mise](https://mise.jdx.dev/getting-started.html), then run these commands in the package directory to install the pinned pnpm version and build the entry:

```sh
mise trust
mise install
mise exec -- pnpm install --frozen-lockfile
```

Then run this command from its parent directory:

```sh
dsh plugin --profile <profile> add ./dsh-xai-auth
```

Requires dsh `>=0.2.0 <0.3.0`. The default profile includes all required services.

## Usage

1. Open **Plugins → dsh-xai-auth → Sign in**.
2. Open the verification page and enter the code to approve sign-in.
3. Select an `xai-supergrok/...` model to start chatting.

On the plugin page:

- **Refresh models** updates the model list.
- **Usage** shows subscription credits and billing details. Readings are cached for 2 minutes. The chat composer also shows the remaining percentage when an `xai-supergrok` model is selected.
- **Sign out** removes local credentials; it does not revoke the token at xAI.

## Notes

- If you reload during sign-in approval, choose **Sign in** again.
- Listed model prices are short-context API prices, not subscription usage. Check **Usage** for subscription credits.
- Set `GROK_OAUTH_USE_API_URL=1` to use `https://api.x.ai/v1` instead of cli-chat-proxy.

## Development

Use Node.js `>=24.9.0`. After code changes, run:

```sh
mise exec -- pnpm run format
mise exec -- pnpm run lint
mise exec -- pnpm run typecheck
mise exec -- pnpm test
```

Run `mise exec -- pnpm run check` for read-only checks. See [AGENTS.md](AGENTS.md) for coding rules.

## License

[MIT](LICENSE)
