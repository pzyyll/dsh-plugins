# DSH IDE Selection (VS Code)

Shares the active VS Code file and text selections with a local dsh IDE bridge.

This package is the editor side only. Install the built dsh plugin from `packages/dsh-ide-selection` as well. The two sides meet through a private loopback discovery file. They do not start each other.

## Requirements

- VS Code 1.144 or later
- A trusted local workspace
- The matching dsh plugin from this repository

## Install

From `packages/dsh-ide-selection`:

```sh
mise run install
mise run package:vsix
cd ide-plugins/vscode && code --install-extension dist/dsh-ide-selection-vscode-$(node -p "require('./package.json').version").vsix
```

You can also use **Extensions: Install from VSIX...** in VS Code.

Reload the window after installation. The extension starts when startup finishes. It does not start dsh.

## Settings

| Key                       | Default | Purpose                                                           |
| ------------------------- | ------- | ----------------------------------------------------------------- |
| `dshIdeSelection.lockDir` | empty   | Absolute lock-directory override. Leave empty to use the default. |

Set the same absolute `lockDir` on the dsh plugin when you override it. Do not use a shared or publicly readable directory.

## Development

Build and package commands run from `packages/dsh-ide-selection`:

| Command                 | Action                                                      |
| ----------------------- | ----------------------------------------------------------- |
| `mise run compile:vsix` | Build `out/extension.js` for local debugging.               |
| `mise run package:vsix` | Build the production bundle and write a VSIX under `dist/`. |

Press F5 in the `dsh-plugins` repository root to build the extension and open an Extension Development Host.

Local packaging does not publish the extension. Releases attach the VSIX to GitHub Release `dsh-ide-selection-vscode-v<version>`, then publish that file to the Visual Studio Marketplace. See [RELEASE.md](../../../../RELEASE.md).
