# dsh-ide-selection

English | [中文](README.zh-CN.md)

Shows the current VS Code selection in dsh, and includes it when you send a message.

Install the dsh plugin and the VS Code extension. One does not start the other.

**Requirements:** dsh `0.2.1-rc.5`, Node.js 24.9 or later in the 24.x series, and VS Code 1.144 or later.

## Install

### dsh plugin

From the `dsh-plugins` repository root:

```sh
mise trust
mise install
```

From `packages/dsh-ide-selection`:

```sh
mise run install
mise run build
```

This build does not install the VS Code extension.

Install this package directory, not the repository root. From the repository root:

```sh
dsh plugin --profile <profile> add ./packages/dsh-ide-selection
```

You can also install that directory from the Web UI.

### VS Code extension

From `packages/dsh-ide-selection`:

```sh
mise run package:vsix
cd ide-plugins/vscode && code --install-extension dist/dsh-ide-selection-vscode-$(node -p "require('./package.json').version").vsix
```

You can also use **Extensions: Install from VSIX...**. Reload VS Code after installation.

The extension runs in a trusted local workspace. It does not start dsh. If it does not start, check the **DSH IDE Selection** output channel.

## Use

1. In VS Code, select the text you want dsh to see. Several selections are kept. If nothing is selected, dsh receives only the open file path.
2. Start dsh from a directory inside that workspace.
3. Send a message.

The selection current at send time is included with the message and kept in the session. It is not added for a subagent. You can still send a message when VS Code is not connected. Do not select secrets.

When the Web UI is connected to VS Code, the composer shows:

| Selection                   | Status               |
| --------------------------- | -------------------- |
| Connected, nothing selected | `⧉`                  |
| One line                    | `⧉ Selected`         |
| More than one line          | `⧉ N Lines Selected` |

`N` is the number of selected lines. Hover the status to see the file and line range, such as `#L10-L20`. Before the first message, the same status appears beside the workspace and preset controls. It disappears when VS Code disconnects, and it does not show the selected text. The status words stay in English.

### Choose an IDE

Run `/select-ide`. The list shows each reachable VS Code window and its folders. Pick a window, **Automatic (workspace match)**, or **Disable IDE integration**. The choice applies to this session immediately. Closing the list keeps the current choice.

Automatic selection uses a VS Code window open on this workspace. If several match, the closest workspace is used. You can instead pick a window open on another folder. If that window disconnects, dsh does not switch to another one. The choice lasts until you leave the session or the plugin restarts.

This works with VS Code on the same computer only.
