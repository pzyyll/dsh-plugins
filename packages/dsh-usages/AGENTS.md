# dsh-usages

Floating usage capsule for the DeepSeek wallet and the OpenCode Go quota.

## Check

From this directory, run `mise run check`. Build the bundles with `mise run build` before installing the package into a profile.

## Boundaries

The host reads `OPENCODE_GO_API_KEY` through the credential store, then the process environment. Do not return that key, log it, or send it to the client. DeepSeek balance comes from the optional `deepseekAccount` service. A missing account service or a missing key degrades that half of the row; it does not unload the plugin.
