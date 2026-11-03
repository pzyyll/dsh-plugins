# dsh-ide-selection

IDE selection integration for dsh. This repository currently contains only the development tools.

## Setup

Install [mise](https://mise.jdx.dev/getting-started.html). Run these commands from the repository root:

```sh
mise trust
mise install
mise exec -- pnpm install --frozen-lockfile
mise exec -- pnpm check
```

`mise.toml` pins Node.js 24 LTS and pnpm. The `packageManager` field pins the same pnpm version. If mise is active in your shell, you can omit `mise exec --`.

## Commands

| Command             | Action                                                     |
| ------------------- | ---------------------------------------------------------- |
| `pnpm check`        | Run lint, format, type, and test checks.                   |
| `pnpm lint`         | Run Oxlint. Fail on warnings.                              |
| `pnpm lint:fix`     | Apply Oxlint fixes.                                        |
| `pnpm format`       | Format files with Oxfmt.                                   |
| `pnpm format:check` | Check formatting without changes.                          |
| `pnpm typecheck`    | Check types with the native TypeScript 7 compiler (`tsc`). |
| `pnpm test`         | Run Vitest once.                                           |
| `pnpm test:watch`   | Run Vitest in watch mode.                                  |

## Tests

Add `*.test.ts` or `*.spec.ts` files next to the code under test. Tests use explicit imports from `vitest` and run in Node.js.

There are no application tests yet. `pnpm test` uses `--passWithNoTests` during setup. Remove this flag when you add the first tests, so missing tests cause a failure.

## Scope

This setup does not include plugin code, VS Code packaging, or a build pipeline. Configure each runtime target when you add its implementation.
