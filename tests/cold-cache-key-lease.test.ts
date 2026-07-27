import { describe, expect, test } from "bun:test";
import { acquireColdCacheKeyLease, clearColdCacheKeyLeases } from "../src/lib/cold-cache-key-lease";

describe("cold-cache-key-lease", () => {
  test("first caller for a key is the leader, second is a follower released by the leader", async () => {
    clearColdCacheKeyLeases();
    const leader = acquireColdCacheKeyLease("k1");
    expect(leader.waitForLeader).toBeNull();

    const follower = acquireColdCacheKeyLease("k1");
    expect(follower.waitForLeader).not.toBeNull();

    let followerProceeded = false;
    const followerWait = follower.waitForLeader!.then(() => { followerProceeded = true; });
    await Promise.resolve(); // let microtasks settle
    expect(followerProceeded).toBe(false); // leader hasn't released yet

    leader.release();
    await followerWait;
    expect(followerProceeded).toBe(true);
  });

  test("release is idempotent and safe to call twice (first-output + finally fallback)", async () => {
    clearColdCacheKeyLeases();
    const leader = acquireColdCacheKeyLease("k2");
    leader.release();
    expect(() => leader.release()).not.toThrow();
  });

  test("a key with no in-flight leader always gets a fresh leader (no cross-key leakage)", () => {
    clearColdCacheKeyLeases();
    const a = acquireColdCacheKeyLease("k3");
    a.release();
    const b = acquireColdCacheKeyLease("k3"); // a already released, so k3 is free again
    expect(b.waitForLeader).toBeNull();
  });
});
