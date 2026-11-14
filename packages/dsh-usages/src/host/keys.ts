// ABOUTME: Resolve the OpenCode key from the credential store, then the environment.
// ABOUTME: The resolved value never leaves the host.

import { credentialRef, isCredentialRefName } from "@deepseek-ai/dsh-credentials";

export interface CredentialStore {
  resolve(ref: ReturnType<typeof credentialRef>): Promise<{ readonly value?: string } | undefined>;
}

/** Return a configured key, or undefined when neither store nor environment has one. */
export async function resolveApiKey(
  credentials: CredentialStore | undefined,
  envName: string,
  env: NodeJS.ProcessEnv,
): Promise<string | undefined> {
  if (!isCredentialRefName(envName)) return undefined;
  if (credentials !== undefined) {
    try {
      const hit = await credentials.resolve(credentialRef(envName));
      if (typeof hit?.value === "string" && hit.value !== "") return hit.value;
    } catch {
      // A store failure still allows the process environment to supply the key.
    }
  }
  const fromEnv = env[envName];
  return typeof fromEnv === "string" && fromEnv !== "" ? fromEnv : undefined;
}
