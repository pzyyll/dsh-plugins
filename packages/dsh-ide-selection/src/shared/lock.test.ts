// ABOUTME: Tests DSH IDE lock creation, private atomic persistence, and candidate discovery.
// ABOUTME: Covers freshness, workspace ranking, and rejection of non-loopback or malformed locks.
import { mkdtemp, readFile, readdir, rm, stat, utimes, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createLock,
  defaultLockDir,
  discoverLocks,
  workspaceMatchDistance,
  writeLock,
} from "./lock.js";

const roots: string[] = [];
async function tempDir(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), "dsh-lock-test-"));
  roots.push(path);
  return path;
}
afterEach(async () => {
  await Promise.all(roots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

function lock(port: number, workspaceFolders: string[], updatedAt = new Date().toISOString()) {
  return { ...createLock(port, "a".repeat(64), workspaceFolders), updatedAt };
}

describe("lock", () => {
  it("uses the private DSH lock directory and writes atomically with private modes", async () => {
    expect(defaultLockDir()).toBe(join(homedir(), ".dsh", "ide-selection", "lock"));
    const dir = await tempDir();
    const path = join(dir, "vscode-test.lock");
    const value = lock(43210, ["/work/app"]);
    await writeLock(path, value);
    expect(JSON.parse(await readFile(path, "utf8"))).toEqual(value);
    if (process.platform !== "win32") {
      expect((await stat(dir)).mode & 0o777).toBe(0o700);
      expect((await stat(path)).mode & 0o777).toBe(0o600);
    }
    expect(await readdir(dir)).toEqual(["vscode-test.lock"]);
  });

  it("creates upstream-shaped loopback VS Code locks", () => {
    const value = createLock(43210, "b".repeat(64), ["/work/app"]);
    expect(value).toMatchObject({
      version: 1,
      ide: "vscode",
      transport: "ws",
      host: "127.0.0.1",
      port: 43210,
    });
    expect(value.authToken).toBe("b".repeat(64));
    expect(createLock(43210, "opaque-token", ["/work/app"]).authToken).toBe("opaque-token");
  });

  it("rejects an oversized but otherwise valid lock file", async () => {
    const dir = await tempDir();
    const oversized = { ...lock(43216, ["/work/app"]), optionalPayload: "x".repeat(128 * 1024) };
    await writeFile(join(dir, "oversized.lock"), JSON.stringify(oversized));
    await expect(discoverLocks(dir, "/work/app", 30_000)).resolves.toEqual([]);
  });

  it("returns no locks when discovery is already aborted", async () => {
    const dir = await tempDir();
    await writeFile(join(dir, "present.lock"), JSON.stringify(lock(43217, ["/work/app"])));
    const controller = new AbortController();
    controller.abort();
    await expect(discoverLocks(dir, "/work/app", 30_000, controller.signal)).resolves.toEqual([]);
  });

  it("filters invalid, stale, and non-matching locks and sorts nearest match then fresh", async () => {
    const dir = await tempDir();
    const now = Date.now();
    const deep = lock(43211, ["/work/app/sub"], new Date(now).toISOString());
    const shallow = lock(43212, ["/work/app"], new Date(now - 10_000).toISOString());
    const stale = lock(43213, ["/work/app/sub"], new Date(now - 100_000).toISOString());
    const outside = lock(43214, ["/elsewhere"]);
    await Promise.all([
      writeFile(join(dir, "deep.lock"), JSON.stringify(deep)),
      writeFile(join(dir, "shallow.lock"), JSON.stringify(shallow)),
      writeFile(join(dir, "stale.lock"), JSON.stringify(stale)),
      writeFile(join(dir, "outside.lock"), JSON.stringify(outside)),
      writeFile(
        join(dir, "bad-host.lock"),
        JSON.stringify({ ...lock(43215, ["/work/app"]), host: "0.0.0.0" }),
      ),
      writeFile(join(dir, "malformed.lock"), "{}"),
    ]);
    await utimes(join(dir, "stale.lock"), new Date(now - 100_000), new Date(now - 100_000));
    const found = await discoverLocks(dir, "/work/app", 30_000);
    expect(found.map((item) => item.port)).toEqual([43212, 43211]);
  });
});

describe("workspaceMatchDistance", () => {
  it.each([
    { name: "same directory", folders: ["/work/app"], distance: 0 },
    { name: "child directory", folders: ["/work/app/src"], distance: 1 },
    { name: "nested directory", folders: ["/work/app/packages/plugin"], distance: 2 },
    { name: "parent directory", folders: ["/work"], distance: Infinity },
    { name: "sibling directory", folders: ["/work/other"], distance: Infinity },
    { name: "shared path prefix", folders: ["/work/app-other"], distance: Infinity },
    { name: "escaped directory", folders: ["/work/app/../other"], distance: Infinity },
    { name: "empty workspace", folders: [], distance: Infinity },
    { name: "one matching multi-root folder", folders: ["/other", "/work/app/src"], distance: 1 },
    { name: "normalized directory", folders: ["/work/app/src/.."], distance: 0 },
  ])("matches $name", ({ folders, distance }) => {
    expect(workspaceMatchDistance(lock(43210, folders), "/work/app")).toBe(distance);
  });

  it("matches Windows paths without case sensitivity but rejects another drive", () => {
    if (process.platform !== "win32") return;
    expect(workspaceMatchDistance(lock(43210, ["c:/WORK/App/src"]), "C:/work/app")).toBe(1);
    expect(workspaceMatchDistance(lock(43210, ["D:/work/app"]), "C:/work/app")).toBe(Infinity);
  });
});
