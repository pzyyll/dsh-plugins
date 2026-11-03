// ABOUTME: Verify that lock discovery cannot exceed the caller's request lifetime.
// ABOUTME: Simulate pending filesystem discovery without adding fake production transports.
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./lock.js", () => ({ discoverLocks: vi.fn(() => new Promise(() => {})) }));
import { discoverLocks } from "./lock.js";
import { readSelection } from "./client.js";

const TIMEOUT_MS = 100;
const options = {
  cwd: "/work/app",
  lockDir: "/private/locks",
  timeoutMs: TIMEOUT_MS,
  maxAgeMs: 60_000,
};
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("discovery request lifetime", () => {
  it("returns when the timeout expires during discovery", async () => {
    vi.useFakeTimers();
    const pending = readSelection({ ...options, signal: new AbortController().signal });
    await vi.advanceTimersByTimeAsync(TIMEOUT_MS);
    await expect(pending).resolves.toBeUndefined();
    expect(discoverLocks).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("returns when the caller cancels pending discovery", async () => {
    const controller = new AbortController();
    const pending = readSelection({ ...options, signal: controller.signal });
    controller.abort();
    await expect(pending).resolves.toBeUndefined();
  });
});
