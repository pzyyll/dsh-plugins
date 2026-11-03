# dsh-plugins

pnpm workspace. Each directory under `packages/` is one installable dsh plugin.

## Versions

`pnpm-workspace.yaml` `catalog` is the only dependency version list. Manifests use `catalog:`.

## Install boundary

`dsh plugin add` installs one package directory. A runtime dependency of a plugin is an external package. Use `workspace:` only for a build-time package that the published `dist` bundles.

## Checks

Run `mise run check` in the package you changed. `packages/dsh-xai-auth/AGENTS.md` lists when extra tasks apply. The root task `mise run install` only installs the shared lockfile.

## Release

release-please versions each configured package on its own tag. Read `RELEASE.md` when changing release config, publish tasks, or a package version.
