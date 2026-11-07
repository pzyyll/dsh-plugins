# dsh-xai-auth

English | [中文](README.zh-CN.md)

Use an xAI SuperGrok or X Premium subscription in dsh through [cli-chat-proxy](https://cli-chat-proxy.grok.com/v1). No `XAI_API_KEY` is needed. The built-in `xai` API route stays unchanged.

## Install

Install from GitHub:

```sh
dsh plugin --profile <profile> add github:pzyyll/dsh-plugins#path:/packages/dsh-xai-auth
```

The package includes the prebuilt host entry at `dist/index.js`. No build step is needed to install this plugin.

To rebuild a local checkout, install [mise](https://mise.jdx.dev/getting-started.html). From the `dsh-plugins` repository root, install the shared toolchain and lockfile:

```sh
mise trust
mise install
mise run install
```

Then run this command in `packages/dsh-xai-auth`:

```sh
mise run build
```

To install the local checkout, run this command from the `dsh-plugins` repository root:

```sh
dsh plugin --profile <profile> add ./packages/dsh-xai-auth
```

Requires dsh `>=0.2.0 <0.3.0`. The default profile includes all required services.

## Usage

1. Open **Plugins → dsh-xai-auth → Sign in**.
2. Open the verification page and enter the code to approve sign-in.
3. Select an `xai-supergrok/...` model to start chatting.

On the plugin page:

- **Refresh models** updates the model list.
- **Usage** shows subscription credits and billing details. Readings are cached for 2 minutes.
- **Sign out** removes local credentials; it does not revoke the token at xAI.

Enable **Show floating usage** on the plugin page after sign-in. A rectangular badge with a circular progress indicator appears at the right edge of the main content area, for all model routes. The badge has a flat dock edge and rounded outer corners. The ring and its center percentage show remaining credits in the same color as the detail bar, and turn red below 15% remaining. They decrease as credits are used. The indicator has no usage label. Hover to see the used percentage in a tooltip. Click to open the usage details. The detail progress bar also shows remaining credits. Click again, press Escape, or click outside to close them.

Enable **Show only in conversations using Grok** to show the badge only on the conversation page with the current session's `xai-supergrok` route. All other main pages, including Plugins, hide it even while a Grok session remains selected. This setting defaults to off and requires **Show floating usage**. Other providers, including API-key Grok routes, and an absent current session hide the badge. Visibility follows confirmed model and session changes.

Drag the badge to move it. During a drag, all four corners are rounded and all borders are visible. Release it to snap to the nearest left or right edge with a short squash-and-rebound animation. Reduced motion skips the animation. It follows content-area size changes and stays visible when the left sidebar collapses. Position resets on reload. The indicator uses the `shell.overlay` slot. The existing `showSidebarUsage` configuration key still controls visibility.

## Notes

- If you reload during sign-in approval, choose **Sign in** again.
- Listed model prices are short-context API prices, not subscription usage. Check **Usage** for subscription credits.
- Set `GROK_OAUTH_USE_API_URL=1` to use `https://api.x.ai/v1` instead of cli-chat-proxy.

## Development

Use Node.js `>=24.9.0`. In this package directory, after code changes, run:

```sh
mise run format
mise run lint
mise run typecheck
mise run test
mise run build
```

`mise run check` runs lint, format, type, and test checks. See [AGENTS.md](AGENTS.md) for coding rules.

## License

[MIT](LICENSE)
