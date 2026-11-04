# DSH IDE Selection (VS Code)

Shares the active file path and selected text in VS Code with dsh on the same computer.

Requires the matching dsh plugin: [@balaenis/dsh-ide-selection](https://www.npmjs.com/package/@balaenis/dsh-ide-selection?activeTab=readme). Install it in dsh to use this extension.

## Send a diagnostic

Open a matching dsh Web session. In VS Code, open Quick Fix on an error or warning and select **DSH: Send diagnostic**. The action inserts the diagnostic and nearby code at the dsh input cursor. Review the draft and send it yourself. It does not run the agent.

Update both components. Keep the dsh composer open and IDE integration enabled. With several matching composers, the first connected one receives the action. Diagnostics are not queued or replayed. Do not send code that contains secrets.
