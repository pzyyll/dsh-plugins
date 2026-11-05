# dsh-my-preset

English | [中文](README.zh-CN.md)

This bundle declares two presets. Both drop the native `web_search` / `web_fetch` tools and mount the Exa MCP server (`mcp__exa__*`) in that preset's own tool scope.

| Preset        | Based on         | What stays                                                                      |
| ------------- | ---------------- | ------------------------------------------------------------------------------- |
| **M-PTC**     | shipped `ptc`    | PTC tool presentation; workflow tools stay disabled                             |
| **M-Creator** | shipped `cordis` | Creator tools: `tool-cordis`, preset-authoring skills, plugin manager, workflow |

Shipped presets (`standard`, `ptc`, `minimal`, `cordis`) do not see Exa. Each of these two presets has its own registration scope, so both can use serverName `exa`.

## Install

A preset is created by installing a bundle that declares it:

```sh
dsh plugin --profile <profile> add ./packages/dsh-my-preset
```

The profile loads both declarations after that. New sessions can pick `M-PTC` or `M-Creator` in the preset roster; sessions already running keep the composition they started with.

## Exa MCP

Each preset loads `@deepseek-ai/dsh-mcp-client` as `exa` over Streamable HTTP at `https://mcp.exa.ai/mcp`, forwarding `EXA_API_KEY` as the `x-api-key` header. The key must be in the process environment (`$DSH_HOME/.env` or the shell that launched dsh); without it the header is empty, the server rejects the session, and no `mcp__exa__*` tools appear. The preset still activates — the client keeps retrying per its reconnect policy and logs the failure.

A preset revision loads once and every Agent that selects it shares that revision, so the profile holds one Exa connection per preset that is loaded, not one per session.

## Files

| File                          | Role                                                                |
| ----------------------------- | ------------------------------------------------------------------- |
| `package.json`                | Bundle manifest. `dsh.bundle.patch` is the ordered patch file list. |
| `presets/m-ptc.patch.yml`     | The `preset-m-ptc` declaration.                                     |
| `presets/m-creator.patch.yml` | The `preset-m-creator` declaration.                                 |

## Diff from the shipped presets

Both presets use the DSH `0.2.2-rc.1` plugin list. They remove `tool-web` (`web_search`, `web_fetch`) and add `mcp-exa` (`@deepseek-ai/dsh-mcp-client`, serverName `exa`).

- **M-PTC** copies `ptc`, including disabled workflow rows and `@deepseek-ai/dsh-tool-executor-ptc`. Display name `M-PTC`, `order: 5`.
- **M-Creator** copies `cordis`: workflow enabled, `tool-cordis`, the preset-authoring skill directory, and plugin-manager tools when a profile is present. Display name `M-Creator`, `order: 6`.

When DSH changes `ptc` or `cordis`, copy that list again, drop `tool-web`, and keep the `mcp-exa` entry.
