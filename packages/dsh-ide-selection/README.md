# dsh-ide-selection

English | [中文](README.zh-CN.md)

Shows the current VS Code selection in dsh, and includes it when you send a message.

Install the dsh plugin and the VS Code extension. One does not start the other.

<img width="1499" height="807" alt="image" src="https://github.com/user-attachments/assets/b3183386-b595-4414-95d7-ce0051d5b1b2" />

<img width="1497" height="430" alt="image" src="https://github.com/user-attachments/assets/c9fecce4-821a-4fcf-b0ba-ee8b3272ceb3" />


## Install

### dsh plugin

Install [@balaenis/dsh-ide-selection](https://www.npmjs.com/package/@balaenis/dsh-ide-selection) from npm:

```sh
dsh plugin --profile <profile> add @balaenis/dsh-ide-selection
```

Replace `<profile>` with your dsh profile name.

### VS Code extension

Install [DSH IDE Selection](https://marketplace.visualstudio.com/items?itemName=balaenis.dsh-ide-selection-vscode) from the VS Code Marketplace, or run:

```sh
code --install-extension balaenis.dsh-ide-selection-vscode
```

Reload VS Code after installation.

The extension runs in a trusted local workspace. It does not start dsh. If it does not start, check the **DSH IDE Selection** output channel.

## Use

1. In VS Code, select the text you want dsh to see. Several selections are kept. If nothing is selected, dsh receives only the open file path.
2. Start dsh in the workspace root that contains the VS Code folder.
3. Send a message.

The selection current at send time is included with the message and kept in the session. It is not added for a subagent. You can still send a message when VS Code is not connected. Do not select secrets.

The Web UI composer always shows the IDE status:

| Selection                   | Status               |
| --------------------------- | -------------------- |
| Not connected               | `⧉` (dimmed)         |
| Connected, nothing selected | `⧉`                  |
| One line                    | `⧉ Selected`         |
| More than one line          | `⧉ N Lines Selected` |

When VS Code is disconnected, the status remains visible with a dimmed icon; when connected, the icon has normal brightness. `N` is the number of selected lines. Hover the status to see the file and line range, such as `#L10-L20`. Before the first message, the same status appears beside the workspace and preset controls, and it does not show the selected text. The status and the `/select-ide` description follow the Web UI language.

### Choose an IDE

Click the status button or run `/select-ide` to open the picker. The status popup shows all reachable VS Code windows and folders; entries outside the dsh workspace are visible but disabled. `/select-ide` lists only selectable matching windows, plus **Automatic (workspace match)** and **Disable IDE integration**. Pick an option to apply it to this session immediately. Closing the list keeps the current choice.

A VS Code window matches when any of its workspace folders is the dsh workspace directory or a subdirectory. An IDE folder that is a parent of the dsh workspace does not match. Automatic selection prefers the same directory, then the nearest descendant; freshness breaks ties. If the selected window disconnects, dsh does not switch to another one. The choice lasts until you leave the session or the plugin restarts.

This works with VS Code on the same computer only.
