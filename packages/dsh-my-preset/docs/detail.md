# M-PTC and M-Creator

Two agent presets that use Exa MCP instead of the native `web_search` and `web_fetch` tools. The built-in presets stay unchanged.

## Choose a preset

Enable this bundle, then start a new session and select a preset:

| Preset        | Purpose                                                                                                     |
| ------------- | ----------------------------------------------------------------------------------------------------------- |
| **M-PTC**     | PTC tool presentation, based on the built-in `ptc` preset. Workflow tools are disabled.                     |
| **M-Creator** | Plugin and preset authoring, based on the built-in `cordis` preset. Creator and workflow tools are enabled. |

Sessions that are already running keep their original composition.

## Exa access

Set `EXA_API_KEY` in the environment of the dsh process before you start it. You can use `$DSH_HOME/.env` or the shell that launches dsh. Restart dsh after changing the key. Do not send the key in a chat message.

Each preset connects to `https://mcp.exa.ai/mcp` and exposes Exa tools as `mcp__exa__*`. Its sessions share that preset's connection.

If the Exa connection fails, the preset can remain active without its search tools. Check the dsh Host log for authentication or connection errors.
