// ABOUTME: Resolves the read-only Grok Build home and OAuth scope key.
// ABOUTME: These paths are never written by the Harness plugin.

import { homedir } from 'node:os'
import { join } from 'node:path'
import {
  GROK_AGENT_ID_FILE,
  GROK_AUTH_FILE,
  GROK_BUILD_MODELS_CACHE_FILE,
  OIDC_CLIENT_ID,
  OIDC_ISSUER,
} from './constants.ts'

export function grokHome(env: NodeJS.ProcessEnv = process.env): string {
  return env.GROK_HOME || join(homedir(), '.grok')
}

export function grokAuthPath(env: NodeJS.ProcessEnv = process.env): string {
  return join(grokHome(env), GROK_AUTH_FILE)
}

export function grokAgentIdPath(env: NodeJS.ProcessEnv = process.env): string {
  return join(grokHome(env), GROK_AGENT_ID_FILE)
}

export function grokBuildModelsCachePath(env: NodeJS.ProcessEnv = process.env): string {
  return join(grokHome(env), GROK_BUILD_MODELS_CACHE_FILE)
}

/** auth.json scope key: `{issuer}::{client_id}`. */
export function authScopeKey(issuer: string = OIDC_ISSUER, clientId: string = OIDC_CLIENT_ID): string {
  return `${issuer.replace(/\/+$/, '')}::${clientId}`
}
