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
- `ide-plugins/vscode/dist/extension.cjs`: the VS Code extension.

## Start the VS Code extension

Launch an Extension Development Host. Replace the path with this checkout's absolute path:

```sh
code --extensionDevelopmentPath="/absolute/path/to/dsh-ide-selection/ide-plugins/vscode" /path/to/your/project
```

On Windows, use a path such as `F:/workspace/my/dsh-ide-selection`. Trust the project in the new VS Code window. Select text in a local file. Multiple selections are supported. With no selected text, the extension supplies the open file path only.

The extension starts a loopback server and refreshes its discovery file. It does not start dsh or send a prompt. Startup and lock-update errors appear in the **DSH IDE Selection** output channel and in warning messages.

## Load the dsh plugin

Use dsh `0.2.1-rc.5`. Save this overlay as `ide-selection.patch.yml`. Replace the plugin path with the absolute path to the built file:

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
- Only matching local workspaces are eligible. The deepest matching workspace ranks first.
- The server rejects browser-origin connections. The client validates received paths and ranges. Discovery files are limited to 64 KiB; WebSocket messages are limited to 1 MiB.
- The plugin sends selected text to the model configured in dsh. Do not select secrets.

The lock directory is separate from pi-x-ide. This extension does not connect automatically to existing pi-x-ide discovery files.

## Limitations

This version supports same-host VS Code only. It does not include WSL path translation, SSH forwarding, diagnostics, automatic installation, marketplace publication, or an explicit attach command. The dsh client connects on demand for each eligible turn; it does not keep a background connection.

Automated tests cover the local transport, selection adapter, and plugin behavior. A live VS Code-to-model session requires manual validation with your dsh profile and credentials.

## Development

| Command           | Action                                   |
| ----------------- | ---------------------------------------- |
| `pnpm check`      | Run lint, format, type, and test checks. |
| `pnpm build`      | Build both runtime bundles.              |
| `pnpm test`       | Run behavior tests.                      |
| `pnpm test:watch` | Watch tests.                             |
| `pnpm format`     | Format project files.                    |

See the [TDD plan](docs/plans/initial-implementation.md) and [third-party notices](THIRD-PARTY-NOTICES.md).
