# IDE selection

Bring the current VS Code file and selection into a dsh conversation. Run both integrations on the same computer.

## Connect VS Code

Install the [DSH IDE Selection extension](https://marketplace.visualstudio.com/items?itemName=balaenis.dsh-ide-selection-vscode), then reload VS Code. Open a trusted local workspace. Start dsh in that workspace directory or a parent directory.

The IDE status beside the dsh input shows whether VS Code is connected. Select text in VS Code, then send your message in dsh. The latest selection is saved with the message. With no selection, only the open file path is included. Subagents do not receive this selection.

## Choose a window

Select the IDE status button or run `/select-ide`. Choose a matching VS Code window, use automatic workspace matching, or disable IDE integration for the session.

A matching VS Code workspace folder must be the dsh workspace or one of its subdirectories. A disconnected selected window is not replaced automatically.

## Add a selection to chat

In a trusted local VS Code file, right-click and select **Add to DSH Chat**. A text selection is optional. Keep the matching dsh Web input open.

The action inserts a file reference chip, e.g. `main.tsx:33–37`, at the input cursor. The chip stores the selection as it was when you added it. When you send the draft, dsh includes that saved code, even if you later edit the file, change the selection, or disconnect VS Code. The code stays out of the visible draft text. Multiple selections stay in one chip; `(+N)` shows the additional ranges. With no selection, the chip includes only the open file path, not the file contents.

You can delete the chip with the editor's normal delete action. The snapshot survives draft restoration. Copying the chip as plain text copies only the path and line reference, not its saved code. Adding a chip does not send a message or change automatic live IDE context. Review the draft, then send it yourself. Saved drafts contain the selected code; do not attach secrets.

Update both integrations. The action follows the session's IDE choice and goes to one matching input. Undelivered actions are not retained or replayed. If the input refuses the edit, use the retry panel.

## Diagnostic actions

Keep the matching dsh Web input open. In VS Code, open Quick Fix on an error or warning:

- **DSH: Send diagnostic** adds the diagnostic and nearby code to the dsh draft. Review and send it yourself. This action does not run the agent.
- **DSH: Fix it** sends a separate repair request. It starts a turn, or queues one if the agent is busy. It can change files under the session's permissions. The existing draft is not sent.

Each action goes to one matching input. Close other matching inputs to choose the receiver. These actions require updated versions of both integrations and do not work in a headless session.

## Connection checks

The VS Code status bar reports `DSH: waiting` or `DSH: connected`. Select it to open the **DSH IDE Selection** output channel.

Do not select or send code that contains secrets.
