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

The latest selection received over the live IDE connection is included with the message and kept in the session. It is not added for a subagent. You can still send a message when VS Code is not connected. Do not select secrets.

The Web UI composer always shows the IDE status:

| Selection                   | Status               |
| --------------------------- | -------------------- |
| Not connected               | `⧉` (dimmed)         |
| Connected, nothing selected | `⧉`                  |
| One line                    | `⧉ Selected`         |
| More than one line          | `⧉ N Lines Selected` |

When VS Code is disconnected, the status remains visible with a dimmed icon; when connected, the icon has normal brightness. `N` is the number of selected lines. Hover the status to see the file and line range, such as `#L10-L20`. Before the first message, the same status appears beside the workspace and preset controls, and it does not show the selected text. The status and the `/select-ide` description follow the Web UI language.

### Add a selection to chat

In a trusted local VS Code file, right-click and select **Add to DSH Chat**. A text selection is optional. Keep the matching dsh Web input open.

The action inserts a file reference chip, e.g. `main.tsx:33–37`, at the input cursor. The chip stores the selection as it was when you added it. When you send the draft, dsh includes that saved code, even if you later edit the file, change the selection, or disconnect VS Code. The code stays out of the visible draft text. Multiple selections stay in one chip; `(+N)` shows the additional ranges. With no selection, the chip includes only the open file path, not the file contents.

You can delete the chip with the editor's normal delete action. The snapshot survives draft restoration. Copying the chip as plain text copies only the path and line reference, not its saved code. Adding a chip does not send a message or change automatic live IDE context. Review the draft, then send it yourself. Saved drafts contain the selected code; do not attach secrets.

Update both integrations. The action follows the session's IDE choice and goes to one matching input. Undelivered actions are not retained or replayed. If the input refuses the edit, use the retry panel.

### Send a diagnostic

1. Open a dsh Web session for the VS Code workspace. Keep its composer open.
2. In VS Code, put the cursor on an error or warning. Open **Quick Fix** (`Ctrl+.` on Windows/Linux, `Cmd+.` on macOS).
3. Select **DSH: Send diagnostic**.

The blank-session Hero and the normal chat input both receive diagnostics. The diagnostic, file path, document version, and nearby code are inserted at the dsh input cursor. Existing text and reference chips outside the input selection stay unchanged. Review the draft, then send it yourself. This action does not start an agent turn. Do not send code that contains secrets.

Diagnostics follow the session's IDE choice. Disabling IDE integration stops diagnostic delivery too. If several matching composers are open, the first connected composer receives the action; delivery is not broadcast. Close other matching composers to choose the receiver. The bridge does not retain undelivered actions or replay them after a reconnect. If the input is locked, the Web UI keeps the text in a retry panel.

Update both the dsh plugin and the VS Code extension to use this feature. It works in the Web UI, not a headless session.

### Fix a diagnostic

Open Quick Fix on an error or warning and select **DSH: Fix it**. This sends a separate repair prompt with the diagnostic context to the connected session. It starts a turn when the agent is idle, or queues a new turn when the agent is busy. It does not interrupt the current turn or send the composer's existing draft, references, or attachments. The repair request appears as a normal user message.

Unlike **Send diagnostic**, this action runs the agent and can change files under the session's permissions. If sending fails, the Web UI keeps the prompt and shows the error. **Insert fix prompt** puts that text into the input for manual review; it does not send it again.

Keep an updated dsh composer open for both diagnostic actions. Status, selection updates, and diagnostic actions share one WebSocket per dsh Host and IDE. The status pill and input receiver also share one browser event stream. Each diagnostic action goes to one matching receiver, not every session.

### VS Code connection status

The VS Code status bar shows the bridge state:

| Label            | Meaning                        |
| ---------------- | ------------------------------ |
| `DSH: waiting`   | No bridge client is connected. |
| `DSH: connected` | A dsh Host is connected.       |

Hover for connection counts. Click the item, or run **DSH: Show IDE Connection Status**, to open the output channel. The state updates when clients connect or disconnect; no selection gesture is required.

Quick Fix needs a trusted local file, an Error or Warning diagnostic in the requested range, and a connected dsh Host. Both DSH actions use the same connection. Information and Hint diagnostics do not qualify. A selection alone, or another extension's generic Fix action, does not qualify. Keep the matching composer open to receive the action.

### Choose an IDE

Click the status button or run `/select-ide` to open the picker. The status popup shows all reachable VS Code windows and folders; entries outside the dsh workspace are visible but disabled. `/select-ide` lists only selectable matching windows, plus **Automatic (workspace match)** and **Disable IDE integration**. Pick an option to apply it to this session immediately. Closing the list keeps the current choice.

A VS Code window matches when any of its workspace folders is the dsh workspace directory or a subdirectory. An IDE folder that is a parent of the dsh workspace does not match. Automatic selection prefers the same directory, then the nearest descendant; freshness breaks ties. If the selected window disconnects, dsh does not switch to another one. The choice lasts until you leave the session or the plugin restarts.

This works with VS Code on the same computer only.
