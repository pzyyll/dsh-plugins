# dsh-my-preset

English | [中文](README.zh-CN.md)

This bundle declares three presets. Each drops the native `web_search` / `web_fetch` tools and mounts the Exa MCP server (`mcp__exa__*`) in that preset's own tool scope.

| Preset         | Based on           | What stays                                                                                             |
| -------------- | ------------------ | ------------------------------------------------------------------------------------------------------ |
| **M-Standard** | shipped `standard` | Standard tools: skills, plan, goals, subagents, workflow, Office; plugin manager when a profile exists |
| **M-PTC**      | shipped `ptc`      | PTC tool presentation; workflow tools stay disabled                                                    |
| **M-Creator**  | shipped `cordis`   | Creator tools: `tool-cordis`, preset-authoring skills, plugin manager, workflow                        |

Shipped presets (`standard`, `ptc`, `minimal`, `cordis`) do not see Exa. Each of these three presets has its own registration scope, so each can use serverName `exa`.

## Install

A preset is created by installing a bundle that declares it:

```sh
dsh plugin --profile <profile> add ./packages/dsh-my-preset
```

The profile loads these declarations after that. New sessions can pick `M-Standard`, `M-PTC`, or `M-Creator` in the preset roster; sessions already running keep the composition they started with.

## Exa MCP

Each preset loads `@deepseek-ai/dsh-mcp-client` as `exa` over Streamable HTTP at `https://mcp.exa.ai/mcp`, forwarding `EXA_API_KEY` as the `x-api-key` header. The key must be in the process environment (`$DSH_HOME/.env` or the shell that launched dsh); without it the header is empty, the server rejects the session, and no `mcp__exa__*` tools appear. The preset still activates — the client keeps retrying per its reconnect policy and logs the failure.

A preset revision loads once and every Agent that selects it shares that revision, so the profile holds one Exa connection per loaded preset, not one per session.

## Files

| File                           | Role                                                                |
| ------------------------------ | ------------------------------------------------------------------- |
| `package.json`                 | Bundle manifest. `dsh.bundle.patch` is the ordered patch file list. |
| `presets/m-standard.patch.yml` | The `preset-m-standard` declaration.                                |
| `presets/m-ptc.patch.yml`      | The `preset-m-ptc` declaration.                                     |
| `presets/m-creator.patch.yml`  | The `preset-m-creator` declaration.                                 |
| `scripts/sync-presets.ts`      | Regenerates the three patch files from the installed DSH.           |

## Diff from the shipped presets

Each preset removes `tool-web` (`web_search`, `web_fetch`) and adds `mcp-exa` (`@deepseek-ai/dsh-mcp-client`, serverName `exa`).

- **M-Standard** follows the shipped `standard` preset: `dsh-doc`, plan mode, goals, subagents, enabled workflow, Office, and plugin-manager tools when a profile is present. Plugin market stays disabled. Display name `M-Standard`, `order: 4` (after built-in `cordis`, which shares that order, because ids sort `cordis` then `m-standard`).
- **M-PTC** follows the shipped `ptc` preset: PTC tool presentation, disabled workflow rows, and `@deepseek-ai/dsh-tool-executor-ptc`. Display name `M-PTC`, `order: 5`.
- **M-Creator** follows the shipped `cordis` preset: workflow enabled, `tool-cordis`, the preset-authoring skill directory, and plugin-manager tools when a profile is present. Display name `M-Creator`, `order: 6`.

The three patch files are generated. Each header names the `@deepseek-ai/dsh-web-app` version it was copied from.

## Regenerate after a DSH upgrade

```sh
mise run sync-presets
```

The script locates the installed DSH, reads `standard`, `ptc`, or `cordis` from its `@deepseek-ai/dsh-web-app` package, copies that plugin list verbatim, turns its `tool-web` row into the `mcp-exa` row, and rewrites only the declaration identity (`preset-m-*`, `id`, `name`, `description`, `order`).

- `node scripts/sync-presets.ts ptc` regenerates one preset.
- `node scripts/sync-presets.ts --check` reports stale files and exits 1 without writing.
- `node scripts/sync-presets.ts --source <path>` reads a specific DSH install (an `app.asar`, its `resources` directory, a `dsh-web-app` package, or a directory holding the preset files) when several are installed.

Do not edit `presets/m-*.patch.yml` by hand: the next sync overwrites it.
