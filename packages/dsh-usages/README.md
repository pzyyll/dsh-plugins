# dsh-usages

English | [简体中文](README.zh-CN.md)

Shows the DeepSeek account balance and the OpenCode Go quota in the sidebar, directly above the account. Click the row to open wallet amounts, the 5-hour window, and the weekly and monthly reset times.

The OpenCode key stays on the host. The plugin reads `OPENCODE_GO_API_KEY` from the credential store, then from the process environment. It never sends the key to the page.

Another plugin can contribute usage without importing this package. This plugin provides the Cordis service `usageSources`. `register({ id, providers, read })` returns a disposer; registering the same `id` again replaces the previous source. `read(refresh, signal)` returns `ready` (`title` and windows), `signed-out`, `failed`, or `unavailable`. A window has `id`, `label`, `usedPercent`, `remainingPercent`, and an optional `resetsAt`. When the service is absent, the contributor keeps its own usage display.

<img width="2073" height="1457" alt="image" src="https://github.com/user-attachments/assets/6136204d-e627-403b-9182-95faefd63ab3" />

## Install

Build this package, then install that directory:

```sh
mise run build
dsh plugin --profile <profile> add ./packages/dsh-usages
```

The sidebar row appears above the account and shows the DeepSeek balance. When the open session's model is OpenCode Go, it shows that quota instead. Click the row for every configured channel.

## Settings

| Setting     | Default                               | Role                               |
| ----------- | ------------------------------------- | ---------------------------------- |
| `usageUrl`  | `https://opencode.ai/zen/go/v1/usage` | OpenCode Go usage endpoint         |
| `apiKeyEnv` | `OPENCODE_GO_API_KEY`                 | Environment name of the Go API key |
| `timeoutMs` | `15000`                               | Request timeout in milliseconds    |
