import { describe, expect, it } from "vitest";

import { generateToken, hashToken } from "@print-cess/crypto";
import type { PrintSession } from "@print-cess/protocol";

import { MemorySessionStore } from "@/server/session-store/memory";

async function fixture() {
  const uploadToken = generateToken();
  const kioskToken = generateToken();
  const mobileToken = generateToken();
  const session: PrintSession = {
    protocolVersion: 1,
    sessionId: generateToken(16),
    status: "waiting",
    kioskPublicKey: `B${"A".repeat(86)}`,
    kioskPublicKeyFingerprint: "A".repeat(43),
    createdAt: 1_000,
    expiresAt: 181_000,
    uploadTokenHash: await hashToken(uploadToken, "upload"),
    kioskTokenHash: await hashToken(kioskToken, "kiosk"),
    revision: 0,
  };
  return { session, uploadToken, kioskToken, mobileToken };
}

describe("MemorySessionStore", () => {
  it("atomically admits one claimant and rejects the second", async () => {
    const store = new MemorySessionStore();
    const { session, mobileToken } = await fixture();
    await store.create(session, 180_000);
    const uploadHash = session.uploadTokenHash;
    const firstMobile = await hashToken(mobileToken, "mobile");
    const firstClaim = await hashToken(generateToken(), "mobile");
    const secondMobile = await hashToken(generateToken(), "mobile");
    const secondClaim = await hashToken(generateToken(), "mobile");
    const results = await Promise.allSettled([
      store.claim(session.sessionId, uploadHash, firstMobile, firstClaim, 2_000, 180_000),
      store.claim(session.sessionId, uploadHash, secondMobile, secondClaim, 2_000, 180_000),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
  });

  it("requires upload start, consumes once, and never reactivates", async () => {
    const store = new MemorySessionStore();
    const { session, mobileToken } = await fixture();
    await store.create(session, 180_000);
    const mobileHash = await hashToken(mobileToken, "mobile");
    const claimId = await hashToken(generateToken(), "mobile");
    const claimed = await store.claim(
      session.sessionId,
      session.uploadTokenHash,
      mobileHash,
      claimId,
      2_000,
      180_000,
    );
    const operationIdHash = await hashToken(generateToken(), "mobile");
    const blobPath = `v1/${generateToken(16)}.bin`;
    const authorization = await store.authorizeUpload(
      session.sessionId,
      mobileHash,
      operationIdHash,
      blobPath,
      3_000,
      claimed.expiresAt,
    );
    expect(authorization.newlyAuthorized).toBe(true);
    const retry = await store.authorizeUpload(
      session.sessionId,
      mobileHash,
      operationIdHash,
      blobPath,
      3_001,
      claimed.expiresAt,
    );
    expect(retry.newlyAuthorized).toBe(false);
    expect(await store.listDueOrphans(claimed.expiresAt, 10)).toEqual([
      expect.objectContaining({ sessionId: session.sessionId, pathname: blobPath }),
    ]);
    await expect(
      store.markUploaded(session.sessionId, mobileHash, { etag: "etag", size: 200 }, 4_000),
    ).rejects.toThrow();
    await store.markUploading(session.sessionId, mobileHash, 4_000);
    await store.markUploaded(session.sessionId, mobileHash, { etag: "etag", size: 200 }, 5_000);
    const consumeId = await hashToken(generateToken(), "kiosk");
    await store.consume(session.sessionId, session.kioskTokenHash, consumeId, 6_000, 30_000);
    await expect(
      store.consume(
        session.sessionId,
        session.kioskTokenHash,
        await hashToken(generateToken(), "kiosk"),
        7_000,
        30_000,
      ),
    ).rejects.toThrow();
    await store.transition(session.sessionId, session.kioskTokenHash, "validating", 8_000);
    await store.transition(session.sessionId, session.kioskTokenHash, "printing", 9_000);
    await store.transition(session.sessionId, session.kioskTokenHash, "completed", 10_000);
    await expect(
      store.transition(session.sessionId, session.kioskTokenHash, "printing", 11_000),
    ).rejects.toThrow();
  });
});
