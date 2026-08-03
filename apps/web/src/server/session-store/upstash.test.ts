import { beforeEach, describe, expect, it, vi } from "vitest";

const redis = vi.hoisted(() => ({ get: vi.fn(), zrange: vi.fn(), zrem: vi.fn() }));

vi.mock("@upstash/redis", () => ({
  Redis: class {
    public readonly get = redis.get;
    public readonly zrange = redis.zrange;
    public readonly zrem = redis.zrem;
  },
}));

import { UpstashSessionStore } from "./upstash";

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

function createStore(): UpstashSessionStore {
  return new UpstashSessionStore({
    NODE_ENV: "test",
    UPSTASH_REDIS_REST_URL: "https://redis.example.test",
    UPSTASH_REDIS_REST_TOKEN: "test-token",
  });
}

describe("UpstashSessionStore persisted session validation", () => {
  beforeEach(() => {
    redis.get.mockReset();
    redis.zrange.mockReset();
    redis.zrem.mockReset();
  });

  it("accepts the Vercel Marketplace KV credential names", () => {
    expect(
      () =>
        new UpstashSessionStore({
          NODE_ENV: "test",
          KV_REST_API_URL: "https://redis.example.test",
          KV_REST_API_TOKEN: "test-token",
        }),
    ).not.toThrow();
  });

  it.each([validSession, JSON.stringify(validSession)])(
    "accepts a valid object or serialized session",
    async (stored) => {
      redis.get.mockResolvedValue(stored);

      await expect(createStore().get(SESSION_ID)).resolves.toEqual(validSession);
      expect(redis.get).toHaveBeenCalledWith(`pc:v1:session:${SESSION_ID}`);
    },
  );

  it.each([
    ["missing revision", { ...validSession, revision: undefined }],
    ["unknown member", { ...validSession, plaintextFilename: "visitor.pdf" }],
    ["non-integer revision", { ...validSession, revision: 0.5 }],
  ])("rejects a stored session with %s", async (_name, stored) => {
    redis.get.mockResolvedValue(stored);

    await expect(createStore().get(SESSION_ID)).rejects.toMatchObject({ name: "ZodError" });
  });

  it("rejects unknown persisted orphan members instead of copying them", async () => {
    redis.zrange.mockResolvedValue([SESSION_ID]);
    redis.get.mockResolvedValue({
      protocolVersion: 1,
      sessionId: SESSION_ID,
      pathname: `v1/${SESSION_ID}.bin`,
      createdAt: 1_000,
      dueAt: 2_000,
      signedUrl: "https://blob.example.test/secret",
    });

    await expect(createStore().listDueOrphans(2_000, 10)).rejects.toMatchObject({
      code: "unavailable",
      status: 503,
    });
  });

  it("rejects unknown persisted receipt members", async () => {
    redis.get.mockResolvedValue({
      protocolVersion: 1,
      sessionId: SESSION_ID,
      status: "completed",
      expiresAt: 2_000,
      signedUrl: "https://blob.example.test/secret",
    });

    await expect(createStore().getReceipt(SESSION_ID)).rejects.toMatchObject({
      name: "ZodError",
    });
  });
});
