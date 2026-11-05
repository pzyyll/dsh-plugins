# DSH IDE Selection (VS Code)

Shares the active file path and selected text in VS Code with dsh on the same computer.

Requires the matching dsh plugin: [@balaenis/dsh-ide-selection](https://www.npmjs.com/package/@balaenis/dsh-ide-selection?activeTab=readme). Install it in dsh to use this extension.

## Add a selection to chat

In a trusted local VS Code file, right-click and select **Add to DSH Chat**. A text selection is optional. Keep the matching dsh Web input open.

The action inserts one file reference chip per selected range, e.g. `main.tsx:33–37` and `main.tsx:51`, at the input cursor. Each chip can be deleted separately. Sending the draft uses each chip's `@relative/path#L33-L37` text without adding a newline; the editor supplies normal spacing between chips. Chips do not store code or expand into `<system-reminder>`. With no selection, one chip refers only to `@relative/path`.

You can delete the chip with the editor's normal delete action. Draft restoration keeps the reference; copying it as plain text copies the path and line range. Adding a chip does not send a message or change automatic live IDE context. Review the draft, then send it yourself.

Update both integrations. The action follows the session's IDE choice and goes to one matching input. Undelivered actions are not retained or replayed. If the input refuses the edit, use the retry panel.

## Send a diagnostic

Open a matching dsh Web session. In VS Code, open Quick Fix on an error or warning and select **DSH: Send diagnostic**. The action inserts the diagnostic and nearby code at the dsh input cursor. Review the draft and send it yourself. It does not run the agent.

Quick Fix requires an Error or Warning diagnostic in a trusted local file. A text selection alone is not enough. Both the blank-session Hero and normal chat input can receive it.

Update both components. Keep the dsh composer open and IDE integration enabled. With several matching composers, the first connected one receives the action. The bridge does not retain undelivered actions or replay them. Do not send code that contains secrets.

## Connection status

The VS Code status bar shows `DSH: waiting` when no dsh Host is connected, or `DSH: connected` when a Host is connected. A connection enables both diagnostic actions on errors and warnings. Keep the matching dsh composer open to receive them.

Hover for counts. Click the item, or run **DSH: Show IDE Connection Status**, to open the output channel. Connection changes update the item immediately.

## Fix a diagnostic

Select **DSH: Fix it** from the same Quick Fix menu. It sends a separate repair prompt to the connected session and can change files under the session's permissions. It starts a turn when idle, or queues a new turn when busy. The existing input draft, references, and attachments stay unchanged.

Fix requires an updated dsh composer. Both diagnostic actions use the same connection as selection updates and go to one matching receiver. If sending fails, the Web UI keeps the prompt for manual review instead of sending it again.
