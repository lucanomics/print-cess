import { describe, expect, it, vi } from "vitest";

import type { DropRecord } from "@print-cess/protocol";

import type { RedisScriptClient } from "../session-store/redis-client";
import { RedisDropStore } from "./redis";

const DROP_ID = "A".repeat(21) + "A";
const OWNER = "A".repeat(43);
const NOW = 1_000;

const stored: DropRecord = {
  protocolVersion: 1,
  dropId: DROP_ID,
  status: "collecting",
  ownerTokenHash: OWNER,
  manifest: "sealedManifest",
  fileCount: 1,
  partCount: 2,
  totalBytes: 80,
  parts: [null, null],
  totalCiphertextBytes: 0,
  openCount: 0,
  downloadCount: 0,
  deliveredCount: 0,
  createdAt: NOW,
  expiresAt: NOW + 1_800_000,
  revision: 0,
};

function client() {
  return {
    eval: vi.fn(),
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
    zrangeByScore: vi.fn(),
    zrem: vi.fn(),
  };
}

function makeStore(redis: ReturnType<typeof client>): RedisDropStore {
  return new RedisDropStore(redis as unknown as RedisScriptClient);
}

describe("RedisDropStore", () => {
  it("reads a stored transfer back through the schema", async () => {
    const redis = client();
    redis.get.mockResolvedValue(JSON.stringify(stored));
    await expect(makeStore(redis).get(DROP_ID)).resolves.toEqual(stored);
    expect(redis.get).toHaveBeenCalledWith(`pc:v1:drop:${DROP_ID}`);
  });

  it("returns null for an absent transfer", async () => {
    const redis = client();
    redis.get.mockResolvedValue(null);
    await expect(makeStore(redis).get(DROP_ID)).resolves.toBeNull();
  });

  it("refuses stored state carrying an unknown member", async () => {
    const redis = client();
    redis.get.mockResolvedValue(JSON.stringify({ ...stored, plaintextName: "passport.pdf" }));
    await expect(makeStore(redis).get(DROP_ID)).rejects.toMatchObject({ status: 503 });
  });

  it("indexes a new transfer by expiry so a sweep can find it", async () => {
    const redis = client();
    redis.eval.mockResolvedValue(1);
    await makeStore(redis).create(stored, 600_000);
    const [, keys, args] = redis.eval.mock.calls[0] as [string, string[], (string | number)[]];
    expect(keys).toEqual([`pc:v1:drop:${DROP_ID}`, "pc:v1:drops:due"]);
    expect(args[2]).toBe(stored.expiresAt);
    expect(args[3]).toBe(DROP_ID);
  });

  it("reports a colliding identifier as a conflict", async () => {
    const redis = client();
    redis.eval.mockResolvedValue(0);
    await expect(makeStore(redis).create(stored, 600_000)).rejects.toMatchObject({ status: 409 });
  });

  it("writes an update only when the revision it read is still current", async () => {
    const redis = client();
    redis.get.mockResolvedValue(JSON.stringify(stored));
    redis.eval.mockResolvedValue(1);
    const updated = await makeStore(redis).commitParts(
      DROP_ID,
      OWNER,
      [{ index: 0, size: 40 }],
      NOW,
    );
    expect(updated.revision).toBe(1);
    const [, , args] = redis.eval.mock.calls[0] as [string, string[], (string | number)[]];
    expect(args[0]).toBe(0);
  });

  it("retries a losing compare-and-set and gives up rather than clobbering", async () => {
    const redis = client();
    redis.get.mockResolvedValue(JSON.stringify(stored));
    redis.eval.mockResolvedValue(-1);
    await expect(
      makeStore(redis).commitParts(DROP_ID, OWNER, [{ index: 0, size: 40 }], NOW),
    ).rejects.toMatchObject({ status: 409 });
    expect(redis.eval).toHaveBeenCalledTimes(3);
  });

  it("reports a transfer that vanished mid-update as missing", async () => {
    const redis = client();
    redis.get.mockResolvedValue(JSON.stringify({ ...stored, parts: [{ size: 17 }, { size: 18 }] }));
    redis.eval.mockResolvedValue(0);
    await expect(makeStore(redis).seal(DROP_ID, OWNER, NOW)).rejects.toMatchObject({ status: 404 });
  });

  it("skips no-op mutations instead of spending a write", async () => {
    const redis = client();
    const ready: DropRecord = { ...stored, status: "ready", parts: [{ size: 17 }, { size: 18 }] };
    redis.get.mockResolvedValue(JSON.stringify(ready));
    await expect(makeStore(redis).seal(DROP_ID, OWNER, NOW)).resolves.toEqual(ready);
    expect(redis.eval).not.toHaveBeenCalled();
  });

  it("drops a due index entry whose record has already expired away", async () => {
    const redis = client();
    redis.zrangeByScore.mockResolvedValue([DROP_ID]);
    redis.get.mockResolvedValue(null);
    await expect(makeStore(redis).listExpired(NOW + 2_000_000, 10)).resolves.toEqual([]);
    expect(redis.zrem).toHaveBeenCalledWith("pc:v1:drops:due", DROP_ID);
  });

  it("clears both the record and its index entry on removal", async () => {
    const redis = client();
    redis.eval.mockResolvedValue(1);
    await makeStore(redis).remove(DROP_ID);
    const [, keys] = redis.eval.mock.calls[0] as [string, string[]];
    expect(keys).toEqual([`pc:v1:drop:${DROP_ID}`, "pc:v1:drops:due"]);
  });

  it("refuses to touch an expired transfer", async () => {
    const redis = client();
    redis.get.mockResolvedValue(JSON.stringify({ ...stored, expiresAt: NOW + 1 }));
    await expect(
      makeStore(redis).commitParts(DROP_ID, OWNER, [{ index: 0, size: 40 }], NOW + 2),
    ).rejects.toMatchObject({ status: 410 });
  });
});
