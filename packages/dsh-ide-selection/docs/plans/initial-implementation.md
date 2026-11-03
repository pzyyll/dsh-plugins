# Initial implementation

## Scope

Build a local VS Code extension and a Cordis plugin for dsh. Target the npm default `@deepseek-ai/dsh` release, `0.2.1-rc.5`, as selected by the user. Keep its dsh peers on the same release. Some subpackage `latest` tags still point to older releases; use the application version. Do not target the local `0.2.2-alpha` source APIs.

Port the selection behavior and protocol from pi-x-ide commit `83c2e6978035363c87a0ebf11144167fcc13a134`. Keep protocol version 1, the authorization header, and JSON-RPC method names. Use a separate lock directory: `~/.dsh/ide-selection/lock`. Both endpoints can override this directory.

Exclude diagnostics, other IDEs, WSL path conversion, auto-install, marketplace publication, and custom dsh UI.

## TDD sequence

For each component, write behavior tests, run them to record a failure, implement the component, then run the focused tests again.

1. **Protocol and transport:** Test authenticated loopback connections, initial snapshots, notifications, invalid payload rejection, stale lock rejection, workspace ranking, connection timeout, cancellation, fallback to another candidate, and socket cleanup. Adapt the upstream transport. Use HTTP upgrade authentication because the current ws documentation discourages `verifyClient`.
2. **Context formatting:** Test zero-based line conversion, open-file context, multiple selections, and selected text limits. Adapt the upstream formatter. Read a fresh snapshot on each eligible human turn; do not suppress unchanged selections.
3. **VS Code adapter:** Test local file snapshots, multiple selections, no active editor, terminal-editor cache retention, and cache invalidation. Implement activation, selection notifications, attach command, atomic lock updates, heartbeat, and shutdown.
4. **dsh plugin:** Inspect the installed npm declarations and runtime. Test the published Cordis hook with actual package types. Inject through a supported durable message path. Cover rejected steps, cancellation, later steps, fresh snapshots on successive turns, changed selection, and independent sessions where supported.
5. **Build and validation:** Bundle the dsh ESM plugin with dsh and Cordis packages external. Bundle the VS Code extension as CJS with `vscode` external. Run `pnpm check`, the build, and focused built-artifact smoke checks. Document any integration that cannot run in this environment.

## Behavior

Read a fresh snapshot for each eligible turn rather than keep a background client. This provides reconnection on the next turn and prevents stale cached selections after disconnect. Bound discovery by workspace, lock age, request timeout, and payload size. Close the socket on all exit paths. Do not fail an ordinary dsh turn when no IDE is available.

Preserve selected context in durable dsh messages. Never modify only the outgoing model request. Keep the existing selected-context reminder format. Mark imported and modified source, and include the upstream Apache-2.0 license.

## Completion criteria

- Tests record red-to-green behavior for the implemented components.
- Both runtime bundles build without importing test code.
- Lint, formatting, types, and tests pass.
- The README gives local build, extension launch, dsh configuration, compatibility, and limitations.
- No files are staged or committed.

## Validation record

- Formatter and plugin configuration tests first failed because their implementation modules did not exist. Both sets passed after implementation.
- Transport, selection-adapter, and lifecycle tests use actual local sockets and temporary lock files. VS Code APIs are mocked in tests only.
- A final check found that discovery was outside the request timeout and invalid snapshots blocked fallback. Three regression tests failed before the fixes, then passed. Discovery now streams directory entries, limits lock reads to 64 KiB, and receives the request cancellation signal.
- Hook tests use published dsh `0.2.1-rc.5` services. A Session admission test records accepted messages and checks JSON round-trip and derived-message content. It is not a full AgentLoop, disk-persistence, or live-model test.
- Required checks: frozen dependency install, `pnpm check`, `pnpm build`, built-plugin import, and VS Code bundle syntax check. A live VS Code-to-model run remains a manual check with a configured dsh profile and credentials.
