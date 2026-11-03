# Release Process

Independently versioned packages. Each configured package has its own version, changelog, and git tag. [release-please](https://github.com/googleapis/release-please) runs in manifest mode.

Ship targets:

| Package | Tag | Latest publish |
| --- | --- | --- |
| `packages/dsh-xai-auth` | `dsh-xai-auth-vX.Y.Z` | npm package `dsh-xai-auth` |
| `packages/dsh-ide-selection` | `dsh-ide-selection-vX.Y.Z` | npm package `dsh-ide-selection` |
| `packages/dsh-ide-selection/ide-plugins/vscode` | `dsh-ide-selection-vscode-vX.Y.Z` | VSIX on that GitHub Release, then the Visual Studio Marketplace |

`next` (npm dist-tag only) is published when a release PR opens or updates. The VS Code extension has no `next` publish: Marketplace releases are `latest` only.

One release PR can list every package that changed. Merging it still tags, releases, and publishes each package on its own.

## Repository layout

```
release-please-config.json        # one entry per package
.release-please-manifest.json     # last released version of each package
packages/<name>/package.json      # version release-please bumps
```

Only list paths that contain a `package.json`. The VS Code extension stays `"private": true` so npm will not publish it. release-please still versions that package. Its release artifact is a VSIX.

## Conventional Commits

release-please attributes a commit to a package by the paths it touches.

- `fix:` patches
- `feat:` minor features
- `feat!:` or `fix!:` breaking changes

A commit under `packages/dsh-xai-auth/**` bumps only that package. A commit under the VS Code extension bumps only `dsh-ide-selection-vscode`. Root-only commits bump nothing.

While a package is `0.x`, breaking changes bump minor (`bump-minor-pre-major: true`).

## Tags

Tags include the component and a `v` prefix: `dsh-xai-auth-v0.1.0`, `dsh-ide-selection-vscode-v0.1.0`.

## Channels

| Channel | Trigger | Result |
| --- | --- | --- |
| `latest` | release PR merged | release-please GitHub Release, then `publish.yml` |
| `next` | release PR opened or updated | npm `<last-release>-next.<commits>` for plugin packages; VS Code extension skipped |

`next` does not create a component tag. The count is commits since that package's last `component-v*` tag.

Plugin `latest` publishes with `pnpm publish` so `catalog:` specifiers are replaced. In GitHub Actions the publish is OIDC trusted publishing with provenance. No `NPM_TOKEN`.

Extension `latest`, in order:

1. `mise run package:vsix` writes `ide-plugins/vscode/dist/dsh-ide-selection-vscode-<version>.vsix`.
2. That file is uploaded to the GitHub Release for `dsh-ide-selection-vscode-v<version>`.
3. `vsce publish --oidc --packagePath <that vsix>` publishes it to the Marketplace.

Marketplace OIDC needs `id-token: write` and a trusted publishing policy whose workflow filename is `publish.yml`. The extension `publisher` must be the Marketplace publisher id. It is currently `local`, which the publish task rejects.

## First release

Do this once per package before automation can update it. Current manifest versions match `package.json` (`0.1.0`).

### npm packages

1. Confirm `version` is `0.1.0`, `repository.url` is `https://github.com/pzyyll/dsh-plugins.git`, and `files` / `exports` are the publish set.
2. From the repo root, after `mise trust`, `mise install`, and `mise run install`:

   ```sh
   mise run publish --package packages/dsh-xai-auth --tag latest --dry-run
   mise run publish --package packages/dsh-xai-auth --tag latest
   ```

   Local publish uses the npm account from `pnpm login`. Add `--otp <code>` when the registry asks for a one-time password. OIDC is CI-only and cannot create the first missing package.

3. Tag the published commit and push the tag:

   ```sh
   git tag dsh-xai-auth-v0.1.0
   git push origin dsh-xai-auth-v0.1.0
   ```

4. On npmjs.com, open the package's Trusted Publisher settings and allow GitHub Actions:
   - Organization or user: `pzyyll`
   - Repository: `dsh-plugins`
   - Workflow filename: `publish.yml`
   - Environment: empty, unless the job later uses a matching GitHub environment

Repeat for `packages/dsh-ide-selection` and tag `dsh-ide-selection-v0.1.0`.

### VS Code extension

1. Set `publisher` in `packages/dsh-ide-selection/ide-plugins/vscode/package.json` to the Marketplace publisher id. Do not publish while it is `local`.
2. Create the Marketplace publisher, then add a trusted publishing policy for repository `pzyyll/dsh-plugins` and workflow `publish.yml`.
3. Push tag `dsh-ide-selection-vscode-v0.1.0` on the commit that should be the baseline, or run `publish.yml` once with path `packages/dsh-ide-selection/ide-plugins/vscode` and channel `latest`. That run uploads the VSIX to GitHub Release `dsh-ide-selection-vscode-v0.1.0`, creating the release if release-please has not yet, then publishes that same VSIX to the Marketplace.

Local `mise run publish` for the extension only builds the VSIX. Upload and Marketplace publish run in GitHub Actions.

## After the baseline

1. Push conventional commits to `main`.
2. `release.yml` opens or updates one release PR with each package's version, `CHANGELOG.md`, and manifest bump.
3. Opening that PR dispatches `next` npm publishes. Packages with no new commits since their component tag skip themselves.
4. Merging the PR creates each package's GitHub Release and dispatches `latest` publish for each released path.

Manual run: Actions → Publish Package → path such as `packages/dsh-ide-selection/ide-plugins/vscode`, channel `latest` or `next`.

## Version overrides

A commit that touches the package can force the next version:

```sh
git commit --allow-empty -m "chore: release dsh-xai-auth 1.0.0" -m "Release-As: 1.0.0"
```

## Do not

- Edit a release-please PR's version or changelog by hand.
- Edit a package `version` on `main`. release-please owns `latest`. The publish task writes `next` only in the CI checkout.
- Delete component tags. `next` uses them to decide whether an npm package changed.
- Publish the VS Code extension with `pnpm publish`, or attach its VSIX to a plugin npm package.
- Publish a `next` VSIX to the Marketplace.
