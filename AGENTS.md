# dsh-plugins

pnpm workspace. Each directory under `packages/` is one installable dsh plugin.

## Versions

`pnpm-workspace.yaml` `catalog` is the only dependency version list. Manifests use `catalog:`.

## Install boundary

`dsh plugin add` installs one package directory. A runtime dependency of a plugin is an external package. Use `workspace:` only for a build-time package that the published `dist` bundles.

## Checks

Run checks in the package you changed. `packages/dsh-xai-auth/AGENTS.md` lists that package's commands. In `packages/dsh-ide-selection`, run `mise run check`. The root task `mise run install` only installs the shared lockfile.
