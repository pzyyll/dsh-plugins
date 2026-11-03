# dsh-plugins

pnpm workspace. Each directory under `packages/` is one installable dsh plugin.

## Versions

`pnpm-workspace.yaml` `catalog` is the only dependency version list. Manifests use `catalog:`.

## Install boundary

`dsh plugin add` installs one package directory. A runtime dependency of a plugin is an external package. Use `workspace:` only for a build-time package that the published `dist` bundles.

## Checks

Package checks stay in each package. From this repository root, `mise run check` runs them. `packages/dsh-xai-auth/AGENTS.md` lists that package's own commands.
