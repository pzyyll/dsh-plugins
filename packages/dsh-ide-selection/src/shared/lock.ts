// ABOUTME: Creates, securely persists, and discovers DSH VS Code lock files.
// ABOUTME: Adapted from pi-x-ide shared lock/discovery helpers for same-host discovery.

import { randomBytes } from "node:crypto";
import {
  chmod,
  mkdir,
  open,
  opendir,
  rename,
  rm,
  writeFile,
  type FileHandle,
} from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, relative, sep } from "node:path";
import { LOCK_FILE_EXTENSION, type IdeLockFile } from "./protocol.js";

const LOCK_DIR_PARTS = [".dsh", "ide-selection", "lock"] as const;
const MAX_PORT_NUMBER = 65_535;
const MAX_AUTH_TOKEN_LENGTH = 64;
const PRIVATE_DIRECTORY_MODE = 0o700;
const PRIVATE_FILE_MODE = 0o600;

export function defaultLockDir(): string {
  return join(homedir(), ...LOCK_DIR_PARTS);
}

export function createLock(
  port: number,
  authToken: string,
  workspaceFolders: string[],
): IdeLockFile {
  if (!Number.isInteger(port) || port < 1 || port > MAX_PORT_NUMBER)
    throw new RangeError("port must be 1..65535");
  if (authToken.length === 0 || authToken.length > MAX_AUTH_TOKEN_LENGTH)
    throw new TypeError("authToken must contain 1..64 characters");
  const now = new Date().toISOString();
  return {
    version: 1,
    ide: "vscode",
    name: "Visual Studio Code",
    transport: "ws",
    host: "127.0.0.1",
    port,
    authToken,
    workspaceFolders: [...new Set(workspaceFolders.filter((path) => path.length > 0))],
    pid: process.pid,
    runningInWindows: process.platform === "win32",
    createdAt: now,
    updatedAt: now,
  };
}

async function setPrivateMode(path: string, mode: number): Promise<void> {
  if (process.platform !== "win32") {
    await chmod(path, mode);
    return;
  }
  try {
    await chmod(path, mode);
  } catch {
    // Windows filesystems do not consistently implement POSIX permission bits.
  }
}

export async function writeLock(path: string, lock: IdeLockFile): Promise<void> {
  const dir = dirname(path);
  await mkdir(dir, { recursive: true, mode: PRIVATE_DIRECTORY_MODE });
  await setPrivateMode(dir, PRIVATE_DIRECTORY_MODE);
  const temporary = `${path}.${process.pid}.${randomBytes(8).toString("hex")}.tmp`;
  try {
    await writeFile(temporary, `${JSON.stringify(lock, null, 2)}\n`, {
      encoding: "utf8",
      mode: PRIVATE_FILE_MODE,
      flag: "wx",
    });
    await setPrivateMode(temporary, PRIVATE_FILE_MODE);
    await rename(temporary, path);
    await setPrivateMode(path, PRIVATE_FILE_MODE);
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => undefined);
    throw error;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isValidPort(value: unknown): value is number {
  return (
    typeof value === "number" && Number.isInteger(value) && value > 0 && value <= MAX_PORT_NUMBER
  );
}

function isPositiveSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function isLock(value: unknown): value is IdeLockFile {
  if (!isRecord(value)) return false;
  return (
    value.version === 1 &&
    value.ide === "vscode" &&
    typeof value.name === "string" &&
    value.transport === "ws" &&
    value.host === "127.0.0.1" &&
    isValidPort(value.port) &&
    typeof value.authToken === "string" &&
    value.authToken.length > 0 &&
    value.authToken.length <= MAX_AUTH_TOKEN_LENGTH &&
    Array.isArray(value.workspaceFolders) &&
    value.workspaceFolders.every((item) => typeof item === "string" && isAbsolute(item)) &&
    (value.pid === undefined || isPositiveSafeInteger(value.pid)) &&
    (value.runningInWindows === undefined || typeof value.runningInWindows === "boolean") &&
    typeof value.createdAt === "string" &&
    Number.isFinite(Date.parse(value.createdAt)) &&
    typeof value.updatedAt === "string" &&
    Number.isFinite(Date.parse(value.updatedAt))
  );
}

/**
 * Rank IDE folders equal to or inside the Session workspace, nearest first.
 * @param lock - discovered IDE lock file.
 * @param cwd - Session workspace directory.
 * @returns the fewest child-directory segments, or Infinity when no folder matches.
 */
export function workspaceMatchDistance(lock: IdeLockFile, cwd: string): number {
  const base = process.platform === "win32" ? cwd.toLowerCase() : cwd;
  let nearest = Infinity;
  for (const folder of lock.workspaceFolders) {
    const target = process.platform === "win32" ? folder.toLowerCase() : folder;
    const rel = relative(base, target);
    if (rel === "") return 0;
    if (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel)) {
      nearest = Math.min(nearest, rel.split(sep).length);
    }
  }
  return nearest;
}

const MAX_LOCK_FILE_BYTES = 64 * 1024;
const LOCK_READ_BUFFER_BYTES = MAX_LOCK_FILE_BYTES + 1;

async function readBoundedLockFile(
  path: string,
  signal?: AbortSignal,
): Promise<{ content: string; mtimeMs: number } | undefined> {
  if (signal?.aborted) return undefined;
  let file: FileHandle | undefined;
  try {
    file = await open(path, "r");
    if (signal?.aborted) return undefined;
    const initialStat = await file.stat();
    if (!initialStat.isFile()) return undefined;

    const buffer = Buffer.alloc(LOCK_READ_BUFFER_BYTES);
    let bytesRead = 0;
    while (bytesRead < buffer.length) {
      if (signal?.aborted) return undefined;
      const result = await file.read(buffer, bytesRead, buffer.length - bytesRead, bytesRead);
      if (result.bytesRead === 0) break;
      bytesRead += result.bytesRead;
    }
    if (signal?.aborted || bytesRead > MAX_LOCK_FILE_BYTES) return undefined;
    const finalStat = await file.stat();
    if (!finalStat.isFile()) return undefined;
    return { content: buffer.subarray(0, bytesRead).toString("utf8"), mtimeMs: finalStat.mtimeMs };
  } catch {
    return undefined;
  } finally {
    await file?.close().catch(() => undefined);
  }
}

export async function discoverLocks(
  lockDir: string,
  cwd: string,
  maxAgeMs: number,
  signal?: AbortSignal,
  scope: "workspace" | "all" = "workspace",
): Promise<IdeLockFile[]> {
  if (!Number.isFinite(maxAgeMs) || maxAgeMs < 0)
    throw new RangeError("maxAgeMs must be non-negative");
  if (signal?.aborted) return [];

  const now = Date.now();
  let directory;
  try {
    directory = await opendir(lockDir);
  } catch {
    return [];
  }

  const found: Array<{ lock: IdeLockFile; distance: number; freshness: number }> = [];
  try {
    for await (const entry of directory) {
      if (signal?.aborted) return [];
      if (!entry.isFile() || !entry.name.endsWith(LOCK_FILE_EXTENSION)) continue;
      const file = await readBoundedLockFile(join(lockDir, entry.name), signal);
      if (signal?.aborted) return [];
      if (!file) continue;
      try {
        const parsed: unknown = JSON.parse(file.content);
        if (!isLock(parsed)) continue;
        const updated = Date.parse(parsed.updatedAt);
        const freshness = Math.min(updated, file.mtimeMs);
        if (now - freshness > maxAgeMs) continue;
        const distance = workspaceMatchDistance(parsed, cwd);
        if (!Number.isFinite(distance) && scope === "workspace") continue;
        found.push({ lock: parsed, distance, freshness });
      } catch {
        // Ignore malformed lock JSON.
      }
    }
  } catch {
    if (signal?.aborted) return [];
  } finally {
    await directory.close().catch(() => undefined);
  }
  if (signal?.aborted) return [];
  found.sort((a, b) => a.distance - b.distance || b.freshness - a.freshness);
  return found.map(({ lock }) => lock);
}
