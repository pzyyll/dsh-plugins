# dsh-ide-selection

VS Code selection context for dsh. This first version ports the selection protocol from [pi-x-ide](https://github.com/balaenis/pi-x-ide).

**Compatibility:** dsh `0.2.1-rc.5`, Node.js 24.9 or later in the 24.x series, and VS Code 1.144 or later. The npm `@deepseek-ai/dsh` application version is the reference; some subpackage `latest` tags point to older releases.

## Build

Install [mise](https://mise.jdx.dev/getting-started.html), then run these commands from the repository root:

```sh
mise trust
mise install
mise exec -- pnpm install --frozen-lockfile
mise exec -- pnpm check
mise exec -- pnpm build
```

If mise is active in your shell, omit `mise exec --`.

The build creates:

- `dist/index.js`: the dsh Cordis plugin.
- `dist/client.js`: the composer status pill and the `/select-ide` popup picker.

The VS Code extension builds separately. See [Package the VS Code extension](#package-the-vs-code-extension).

## Start the VS Code extension

Open the repository root in VS Code. Open **Run and Debug**. Select **Run DSH IDE Selection VS Code Extension**. Press F5.

F5 runs `mise run compile:vsix`. VS Code then opens an Extension Development Host for this folder. Trust that window. Select text in a local file. Multiple selections are supported. With no selected text, the extension supplies the open file path only.

You can start the same host from a terminal. Replace the path with this checkout's absolute path:

```sh
code --extensionDevelopmentPath="/absolute/path/to/dsh-ide-selection/ide-plugins/vscode" /path/to/your/project
```

On Windows, use a path such as `F:/workspace/my/dsh-ide-selection`.

The extension starts a loopback server and refreshes its discovery file. It does not start dsh or send a prompt. Startup and lock-update errors appear in the **DSH IDE Selection** output channel and in warning messages.

## Package the VS Code extension

The extension package is `ide-plugins/vscode`. `pnpm build` does not build it. The flow follows pi-x-ide: esbuild writes `ide-plugins/vscode/out/extension.js`, and `@vscode/vsce` writes the VSIX under `ide-plugins/vscode/dist/`. Only `vscode` stays external. The bundle includes the shared IDE transport and `ws`.

vsce does not support pnpm dependency walks. The package command passes `--no-dependencies` and does not set `vscode:prepublish`. This does not publish to the Marketplace.

```sh
mise run compile:vsix
mise run package:vsix
cd ide-plugins/vscode && code --install-extension dist/dsh-ide-selection-vscode-$(node -p "require('./package.json').version").vsix
```

`compile:vsix` keeps a source map for F5. `package:vsix` rebuilds a minified bundle without a source map, then writes the VSIX. Reload VS Code after installation. Install the dsh plugin separately. The VSIX does not contain it.

## Install the dsh plugin

Use dsh `0.2.1-rc.5`. Build this package first. In the Web UI, install this checkout directory as a plugin. The package declares `dsh.bundle`, so dsh enables the bundle, loads `dist/index.js`, and serves the composer status pill.

You can also start dsh with an overlay. Save this file as `ide-selection.patch.yml` and replace the plugin path with the absolute path to the built file:

```yaml
- insert:
    - id: ide-selection
      name: "/absolute/path/to/dsh-ide-selection/dist/index.js"
```

Start dsh with the overlay from a directory inside the VS Code workspace:

```sh
dsh web --patch ./ide-selection.patch.yml
```

Submit a request about the selected code. The plugin reads a fresh IDE snapshot before the first model step of each accepted human turn, even if the selection has not changed. It skips subagent and synthetic turns. It adds selected context through dsh's durable user-message path, so session history retains the supplied text. No IDE connection is required for ordinary requests.

When the Web UI is connected to VS Code, the composer status line shows `⧉`. After you select lines, it shows `⧉ Selected Lines N`, where `N` is the inclusive line count. Hover the status to see the workspace-relative file and the line range, using the same `#L10-L20` form as pi-x-ide. The status disappears when the IDE disconnects. It does not include the selected text.

## Select an IDE

Run `/select-ide` in a dsh conversation. The command opens the same searchable popup list `/model` uses. The list shows every reachable IDE with its workspace paths and local port, then two session rows: automatic selection by workspace and disabling IDE integration. Pick a row and it applies immediately.

Manual selection can connect to an IDE outside the conversation's workspace, as in pi-x-ide. This version lists VS Code instances only.

The selection applies only to the current session. Both the composer status and fresh turn reads use that IDE. If it disconnects, the plugin does not substitute another IDE. The choice resets when the session unloads or the plugin restarts. Closing the popup keeps the current choice; a failed pick reports the host's reason and keeps the previous one.

The list contains no authentication tokens or selected text. Automatic selection still requires a matching workspace. A bare host invocation without the Web picker (a non-Web surface or a programmatic call) answers with the same reachable IDEs as text, and programmatic callers may still pass `auto`, `off`, or one IDE id.

## Configuration

Add these optional fields under the overlay entry's `config`:

| Field       | Default                     | Purpose                                                                |
| ----------- | --------------------------- | ---------------------------------------------------------------------- |
| `lockDir`   | `~/.dsh/ide-selection/lock` | Absolute discovery directory.                                          |
| `timeoutMs` | `1000`                      | Total discovery, connection, and snapshot time budget in milliseconds. |
| `maxAgeMs`  | `180000`                    | Maximum discovery-file age in milliseconds.                            |
| `maxChars`  | `24000`                     | Shared selected-text budget across all ranges.                         |

For a custom `lockDir`, set VS Code's machine setting `dshIdeSelection.lockDir` to the same absolute path. Reload the extension host after changing it. Do not use a shared or publicly readable directory. These paths belong to the user account that runs each process; `~` is not expanded in a custom path.

## Protocol and privacy

- Protocol version: `1`.
- Transport: authenticated WebSocket and JSON-RPC 2.0 on `127.0.0.1`.
- Authentication header: `x-pi-x-ide-authorization`, retained for wire compatibility.
- Default discovery directory: `~/.dsh/ide-selection/lock`.
- Each VS Code session creates a random token. Discovery files contain this token and workspace paths. POSIX permissions are private; Windows uses the account's filesystem access controls.
- Automatic selection uses matching local workspaces. The deepest matching workspace ranks first. `/select-ide` can explicitly select another local IDE.
- The server rejects browser-origin connections. The client validates received paths and ranges. Discovery files are limited to 64 KiB; WebSocket messages are limited to 1 MiB.
- The plugin sends selected text to the model configured in dsh. Do not select secrets.

The lock directory is separate from pi-x-ide. This extension does not connect automatically to existing pi-x-ide discovery files.

## Limitations

This version supports same-host VS Code only. It does not include WSL path translation, SSH forwarding, diagnostics, automatic installation, Marketplace publication, or a separate attach-selection command. You can still pack a local VSIX. Turn injection connects on demand for each eligible turn. The composer status uses a separate live connection while a browser subscribes.

Automated tests cover the local transport, selection adapter, and plugin behavior. A live VS Code-to-model session requires manual validation with your dsh profile and credentials.

## Development

| Command                 | Action                                           |
| ----------------------- | ------------------------------------------------ |
| `pnpm check`            | Run lint, format, type, and test checks.         |
| `pnpm build`            | Build the host and browser bundles.              |
| `mise run compile:vsix` | Build the VS Code extension for local debugging. |
| `mise run package:vsix` | Pack the VS Code extension into a VSIX.          |
| `pnpm test`             | Run behavior tests.                              |
| `pnpm test:watch`       | Watch tests.                                     |
| `pnpm format`           | Format project files.                            |

See the [TDD plan](docs/plans/initial-implementation.md) and [third-party notices](THIRD-PARTY-NOTICES.md).
