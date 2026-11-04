# DSH IDE Selection (VS Code)

Shares the file and text you select in VS Code with dsh on the same computer.

This extension is only the editor side. Install the matching dsh plugin as well. The two sides find each other through a private lock file on this computer. Neither one starts the other.

## Requirements

- VS Code 1.144 or later
- A trusted local workspace
- The matching dsh plugin

## Install

From `packages/dsh-ide-selection`:

```sh
mise run package:vsix
cd ide-plugins/vscode && code --install-extension dist/dsh-ide-selection-vscode-$(node -p "require('./package.json').version").vsix
```

You can also use **Extensions: Install from VSIX...** and choose that file.

Reload the window after installation. The extension starts when startup finishes, and only in a trusted workspace. It does not start dsh. If it does not start, open the **DSH IDE Selection** output channel.

## Use

1. In VS Code, select the text you want dsh to see. Every non-empty selection in the active editor is kept. If nothing is selected, dsh receives only the open file path.
2. Start dsh from a directory inside that workspace.
3. Send a message. dsh includes the selection that is current at send time.

Run `/select-ide` in dsh to pick a VS Code window, match this workspace automatically, or turn IDE integration off. Do not select secrets.

How the selection appears in the Web UI is described in the [dsh plugin guide](../../README.md).

## Settings

| Key                       | Default | Purpose                                                                                                |
| ------------------------- | ------- | ------------------------------------------------------------------------------------------------------ |
| `dshIdeSelection.lockDir` | empty   | Absolute lock-directory override. Leave empty to use `.dsh/ide-selection/lock` in your home directory. |

Set the same absolute path on the dsh plugin when you override it. Use a directory only you can read. A relative path is rejected, and the extension does not start.
