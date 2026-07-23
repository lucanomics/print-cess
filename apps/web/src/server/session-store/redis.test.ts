import { beforeEach, describe, expect, it, vi } from "vitest";

import { RailwayRedisSessionStore, type RedisScriptClient } from "./redis";
import { createNodeRedisScriptClient } from "./redis-client";

const SESSION_ID = "A".repeat(22);
const DIGEST = "A".repeat(43);
const validSession = {
  protocolVersion: 1,
  sessionId: SESSION_ID,
  status: "waiting",
  kioskPublicKey: `B${"A".repeat(86)}`,
  kioskPublicKeyFingerprint: DIGEST,
  createdAt: 1_000,
  expiresAt: 181_000,
  uploadTokenHash: DIGEST,
  kioskTokenHash: DIGEST,
  revision: 0,
} as const;

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

function makeStore(redis: ReturnType<typeof client>): RailwayRedisSessionStore {
  return new RailwayRedisSessionStore(redis as unknown as RedisScriptClient);
}

describe("RailwayRedisSessionStore validation", () => {
  it("accepts a serialized session string from a raw Redis reply", async () => {
    const redis = client();
    redis.get.mockResolvedValue(JSON.stringify(validSession));
    const store = makeStore(redis);
    await expect(store.get(SESSION_ID)).resolves.toEqual(validSession);
    expect(redis.get).toHaveBeenCalledWith(`pc:v1:session:${SESSION_ID}`);
  });

  it("returns null when the session is absent", async () => {
    const redis = client();
    redis.get.mockResolvedValue(null);
    await expect(makeStore(redis).get(SESSION_ID)).resolves.toBeNull();
  });

  it("rejects a stored session with an unknown member", async () => {
    const redis = client();
    redis.get.mockResolvedValue(JSON.stringify({ ...validSession, plaintextFilename: "x.pdf" }));
    await expect(makeStore(redis).get(SESSION_ID)).rejects.toMatchObject({
      name: "ZodError",
    });
  });

  it("rejects an unknown persisted receipt member", async () => {
    const redis = client();
    redis.get.mockResolvedValue(
      JSON.stringify({
        protocolVersion: 1,
        sessionId: SESSION_ID,
        status: "completed",
        expiresAt: 2_000,
        signedUrl: "https://blob.example.test/secret",
      }),
    );
    await expect(makeStore(redis).getReceipt(SESSION_ID)).rejects.toMatchObject({
      name: "ZodError",
    });
  });

  it("drops and skips a due orphan whose record has disappeared", async () => {
    const redis = client();
    redis.zrangeByScore.mockResolvedValue([SESSION_ID]);
    redis.get.mockResolvedValue(null);
    const store = makeStore(redis);
    await expect(store.listDueOrphans(2_000, 10)).resolves.toEqual([]);
    expect(redis.zrem).toHaveBeenCalledWith("pc:v1:orphans:due", SESSION_ID);
  });

  it("rejects an unknown persisted orphan member instead of copying it", async () => {
    const redis = client();
    redis.zrangeByScore.mockResolvedValue([SESSION_ID]);
    redis.get.mockResolvedValue(
      JSON.stringify({
        protocolVersion: 1,
        sessionId: SESSION_ID,
        pathname: `v1/${SESSION_ID}.bin`,
        createdAt: 1_000,
        dueAt: 2_000,
        signedUrl: "https://blob.example.test/secret",
      }),
    );
    await expect(makeStore(redis).listDueOrphans(2_000, 10)).rejects.toMatchObject({
      code: "unavailable",
      status: 503,
    });
  });
});

describe("RailwayRedisSessionStore atomic reply handling", () => {
  let redis: ReturnType<typeof client>;
  let store: RailwayRedisSessionStore;

  beforeEach(() => {
    redis = client();
    store = makeStore(redis);
  });

  it("normalizes a numeric-string create reply and succeeds", async () => {
    redis.eval.mockResolvedValue("1");
    await expect(store.create(validSession, 60_000)).resolves.toBeUndefined();
  });

  it("maps a create reply of 0 to a conflict", async () => {
    redis.eval.mockResolvedValue(0);
    await expect(store.create(validSession, 60_000)).rejects.toMatchObject({
      code: "conflict",
      status: 409,
    });
  });

  it("short-circuits an idempotent upload authorization without a write", async () => {
    const operationIdHash = DIGEST;
    redis.get.mockResolvedValue(
      JSON.stringify({
        ...validSession,
        status: "upload_authorized",
        mobileTokenHash: DIGEST,
        encryptedBlobPath: `v1/${SESSION_ID}.bin`,
        uploadOperationIdHash: operationIdHash,
        revision: 2,
      }),
    );
    const result = await store.authorizeUpload(
      SESSION_ID,
      DIGEST,
      operationIdHash,
      `v1/${SESSION_ID}.bin`,
      100,
      60_000,
    );
    expect(result.newlyAuthorized).toBe(false);
    expect(redis.eval).not.toHaveBeenCalled();
  });

  it("maps an authorize reply of -2 to an orphan-tracking conflict", async () => {
    redis.get.mockResolvedValue(
      JSON.stringify({ ...validSession, status: "claimed", mobileTokenHash: DIGEST, revision: 1 }),
    );
    redis.eval.mockResolvedValue(-2);
    await expect(
      store.authorizeUpload(
        SESSION_ID,
        DIGEST,
        "B".repeat(43),
        `v1/${SESSION_ID}.bin`,
        100,
        60_000,
      ),
    ).rejects.toMatchObject({ code: "conflict", status: 409 });
  });

  it("maps prepareCleanup replies by action and rejects a non-string reply", async () => {
    redis.eval.mockResolvedValueOnce(JSON.stringify({ action: "absent" }));
    await expect(store.prepareCleanup(SESSION_ID, 1_000)).resolves.toEqual({ action: "absent" });

    redis.eval.mockResolvedValueOnce(JSON.stringify({ action: "defer", retryAt: 5_000 }));
    await expect(store.prepareCleanup(SESSION_ID, 1_000)).resolves.toEqual({
      action: "defer",
      retryAt: 5_000,
    });

    redis.eval.mockResolvedValueOnce(42);
    await expect(store.prepareCleanup(SESSION_ID, 1_000)).rejects.toMatchObject({
      code: "unavailable",
      status: 503,
    });
  });

  it("returns finalizeCleanup success only for a reply of 1", async () => {
    redis.eval.mockResolvedValueOnce(1);
    await expect(store.finalizeCleanup(SESSION_ID, 3, null)).resolves.toBe(true);
    redis.eval.mockResolvedValueOnce(0);
    await expect(store.finalizeCleanup(SESSION_ID, 3, null)).resolves.toBe(false);
  });
});

describe("railway-redis client TLS enforcement", () => {
  it("rejects a non-TLS REDIS_URL", () => {
    expect(() =>
      createNodeRedisScriptClient({ NODE_ENV: "test", REDIS_URL: "redis://redis.internal:6379" }),
    ).toThrow(/TLS connection/u);
  });

  it("rejects a missing REDIS_URL", () => {
    expect(() => createNodeRedisScriptClient({ NODE_ENV: "test" })).toThrow(
      /REDIS_URL is required/u,
    );
  });

  it("propagates the TLS requirement through the default store constructor", () => {
    expect(
      () =>
        new RailwayRedisSessionStore(undefined, { NODE_ENV: "test", REDIS_URL: "redis://x:6379" }),
    ).toThrow(/TLS connection/u);
  });
});
