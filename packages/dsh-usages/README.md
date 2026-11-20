# dsh-usages

English | [简体中文](README.zh-CN.md)

Shows one usage amount in a floating capsule on the content edge, with no channel name. During a conversation it follows the session model. Away from a conversation it shows the DeepSeek balance when that channel is configured, and otherwise the first configured channel. Click it to open every configured channel.

The OpenCode key stays on the host. The plugin reads `OPENCODE_GO_API_KEY` from the credential store, then from the process environment. It never sends the key to the page.

Another plugin can contribute usage without importing this package. This plugin provides the Cordis service `usageSources`. `register({ id, providers, read })` returns a disposer; registering the same `id` again replaces the previous source. `read(refresh, signal)` returns `ready` (`title` and windows), `signed-out`, `failed`, or `unavailable`. A window has `id`, `label`, `usedPercent`, `remainingPercent`, and an optional `resetsAt`. When the service is absent, the contributor keeps its own usage display.

<img width="2073" height="1457" alt="image" src="https://github.com/user-attachments/assets/6136204d-e627-403b-9182-95faefd63ab3" />

## Install

Build this package, then install that directory:

```sh
mise run build
dsh plugin --profile <profile> add ./packages/dsh-usages
```

Drag the capsule to move it. Release it to snap to the nearest left or right edge. The position resets on reload. Reduced motion skips the snap animation.

## Settings

| Setting     | Default                               | Role                               |
| ----------- | ------------------------------------- | ---------------------------------- |
| `usageUrl`  | `https://opencode.ai/zen/go/v1/usage` | OpenCode Go usage endpoint         |
| `apiKeyEnv` | `OPENCODE_GO_API_KEY`                 | Environment name of the Go API key |
| `timeoutMs` | `15000`                               | Request timeout in milliseconds    |
