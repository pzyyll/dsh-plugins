# dsh-plugins

English | [简体中文](README.zh-CN.md)

pnpm workspace for local dsh plugins. Dependency versions are in the root catalog (`pnpm-workspace.yaml`). Each plugin stays a separate installable directory.

## Packages

| Package             | Path                         | Role                      |
| ------------------- | ---------------------------- | ------------------------- |
| `dsh-xai-auth`      | `packages/dsh-xai-auth`      | xAI SuperGrok sign-in     |
| `dsh-ide-selection` | `packages/dsh-ide-selection` | VS Code selection context |
| `dsh-my-preset`     | `packages/dsh-my-preset`     | My presets                |

## Requirements

Node.js 24.9 or later in the 24.x series, and pnpm 12.16.1. mise installs both.

## Setup

From this directory:

```sh
mise trust
mise install
pnpm install
```

The first `pnpm install` writes `pnpm-lock.yaml`. Later installs from this directory use `mise run install`.

## Tasks

The root task only installs the shared lockfile. Build and check each plugin in its own directory with `mise run`.

## Release

Each package under `release-please-config.json` is versioned and tagged on its own. Plugin packages publish to npm. The VS Code extension's VSIX is attached to its GitHub Release, then published to the Visual Studio Marketplace. See [RELEASE.md](RELEASE.md).

## Install a plugin

dsh installs one package directory, not this repository root.

```sh
dsh plugin --profile <profile> add ./packages/dsh-xai-auth
dsh plugin --profile <profile> add ./packages/dsh-ide-selection
dsh plugin --profile <profile> add ./packages/dsh-my-preset
```

Build `dsh-ide-selection` before you install it. `dsh-xai-auth` already includes `dist/index.js`, and `dsh-my-preset` ships only patch files.

After this repository is on GitHub:

```sh
dsh plugin --profile <profile> add github:pzyyll/dsh-plugins#path:/packages/dsh-xai-auth
```
