# Coding rules

## Toolchain

- Use the pnpm version in `mise.toml`. Keep `package.json#packageManager` in sync.
- On first use, run `mise trust`, then `mise install`.
- Run `mise exec -- pnpm install --frozen-lockfile` to install dependencies.
- Use `mise exec -- pnpm` for project commands, or activate mise in your shell.
- Commit dependency changes with `pnpm-lock.yaml`. Use pnpm to update the lockfile.
- The dsh development dependencies provide the host APIs for tests and type checks. Keep them compatible with the supported dsh runtime; its npm `latest` tag can point to an older API.

## Code style

- Follow `.oxfmtrc.json` and `.oxlintrc.json`. Use Oxfmt for formatting and Oxlint for lint checks.
- Use 2 spaces, single quotes, no semicolons, and trailing commas. Let Oxfmt wrap lines.
- Start each code file with two `// ABOUTME: ` comments. State its purpose and scope.
- Use strict TypeScript for host code in `src/` and tests in `tests/`. Keep the browser entry in `lib/client.js`.
- Use ESM imports. Keep `.ts` extensions on relative TypeScript imports. Use `import type` for type-only imports.
- Use descriptive names. Name non-trivial numeric values as constants. Reuse existing helpers and keep changes limited to the task.
- Keep errors and asynchronous return types explicit at API boundaries. Narrow unknown values before use.
- Keep credentials and tokens out of source files, logs, and test fixtures.
- Update relevant tests when behavior changes. Keep `dist/` as generated output.

## Required checks

After each code change, run these commands in order:

```sh
mise exec -- pnpm run format
mise exec -- pnpm run lint
mise exec -- pnpm run typecheck
```

All three commands must pass before the task is complete. Fix failures instead of disabling checks. Report any blocker that prevents validation.

Run `mise exec -- pnpm run check` for a read-only formatting, lint, and type check. Also run `mise exec -- pnpm test` for behavior changes and `mise exec -- pnpm run build` for build or package changes.
