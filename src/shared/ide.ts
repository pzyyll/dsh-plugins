// ABOUTME: Identify local IDE instances without exposing their authentication tokens.
// ABOUTME: Describe live IDE candidates for session-scoped manual selection.
import { createHash } from "node:crypto";
import type { IdeLockFile } from "./protocol.js";

export interface AvailableIde {
  id: string;
  name: string;
  host: "127.0.0.1";
  port: number;
  workspaceFolders: string[];
}

/** Keep a manual choice bound to one IDE process, not a reused listening port. */
export function ideLockId(lock: IdeLockFile): string {
  return createHash("sha256")
    .update(JSON.stringify([lock.host, lock.port, lock.pid, lock.createdAt]))
    .digest("hex");
}
