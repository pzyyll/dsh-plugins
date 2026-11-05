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

The action inserts one file reference chip per selected range, e.g. `main.tsx:33–37` and `main.tsx:51`, at the input cursor. Each chip can be deleted separately. Sending the draft uses each chip's `@relative/path#L33-L37` text without adding a newline; the editor supplies normal spacing between chips. Chips do not store code or expand into `<system-reminder>`. With no selection, one chip refers only to `@relative/path`.

You can delete the chip with the editor's normal delete action. Draft restoration keeps the reference; copying it as plain text copies the path and line range. Adding a chip does not send a message or change automatic live IDE context. Review the draft, then send it yourself.

Update both integrations. The action follows the session's IDE choice and goes to one matching input. Undelivered actions are not retained or replayed. If the input refuses the edit, use the retry panel.

## Diagnostic actions

Keep the matching dsh Web input open. In VS Code, open Quick Fix on an error or warning:

- **DSH: Send diagnostic** adds the diagnostic and nearby code to the dsh draft. Review and send it yourself. This action does not run the agent.
- **DSH: Fix it** sends a separate repair request. It starts a turn, or queues one if the agent is busy. It can change files under the session's permissions. The existing draft is not sent.

Each action goes to one matching input. Close other matching inputs to choose the receiver. These actions require updated versions of both integrations and do not work in a headless session.

## Connection checks

The VS Code status bar reports `DSH: waiting` or `DSH: connected`. Select it to open the **DSH IDE Selection** output channel.

Do not select or send code that contains secrets.
