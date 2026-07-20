import { describe, expect, it } from "vitest";

import { generateToken, hashToken } from "@print-cess/crypto";
import type { PrintSession } from "@print-cess/protocol";

import type {
  BlobMetadata,
  BlobTransport,
  CleanupScheduler,
  SignedBlobOperation,
} from "@/server/contracts";
import { cleanupSession, sweepDueOrphans, type ServerRuntime } from "@/server/runtime";
import { MemorySessionStore } from "@/server/session-store/memory";

class RecordingBlobTransport implements BlobTransport {
  public readonly deleted: Array<{ pathname: string; etag?: string }> = [];
  public failDelete = false;

  public async authorizeUpload(): Promise<SignedBlobOperation> {
    throw new Error("Not used by cleanup tests");
  }

  public async authorizeDownload(): Promise<SignedBlobOperation> {
    throw new Error("Not used by cleanup tests");
  }

  public async head(): Promise<BlobMetadata> {
    throw new Error("Not used by cleanup tests");
  }

  public async delete(pathname: string, etag?: string): Promise<void> {
    if (this.failDelete) throw new Error("simulated blob deletion failure");
    this.deleted.push({ pathname, ...(etag ? { etag } : {}) });
  }
}

class RecordingCleanupScheduler implements CleanupScheduler {
  public readonly scheduled: Array<{ sessionId: string; dueAt: number }> = [];

  public async schedule(sessionId: string, dueAt: number): Promise<void> {
    this.scheduled.push({ sessionId, dueAt });
  }
}

async function uploadedFixture(store: MemorySessionStore, base: number, ttlMs = 60_000) {
  const uploadToken = generateToken();
  const kioskToken = generateToken();
  const mobileToken = generateToken();
  const session: PrintSession = {
    protocolVersion: 1,
    sessionId: generateToken(16),
    status: "waiting",
    kioskPublicKey: `B${"A".repeat(86)}`,
    kioskPublicKeyFingerprint: "A".repeat(43),
    createdAt: base,
    expiresAt: base + ttlMs,
    uploadTokenHash: await hashToken(uploadToken, "upload"),
    kioskTokenHash: await hashToken(kioskToken, "kiosk"),
    revision: 0,
  };
  await store.create(session, ttlMs);
  const mobileHash = await hashToken(mobileToken, "mobile");
  const claimed = await store.claim(
    session.sessionId,
    session.uploadTokenHash,
    mobileHash,
    await hashToken(generateToken(), "mobile"),
    base + 1,
    ttlMs,
  );
  const pathname = `v1/${generateToken(16)}.bin`;
  await store.authorizeUpload(
    session.sessionId,
    mobileHash,
    await hashToken(generateToken(), "mobile"),
    pathname,
    base + 2,
    claimed.expiresAt,
  );
  await store.markUploading(session.sessionId, mobileHash, base + 3);
  await store.markUploaded(
    session.sessionId,
    mobileHash,
    { etag: "fixture-etag", size: 512 },
    base + 4,
  );
  return {
    sessionId: session.sessionId,
    kioskTokenHash: session.kioskTokenHash,
    pathname,
    expiresAt: claimed.expiresAt,
  };
}

function testRuntime(
  sessions: MemorySessionStore,
  blobs: BlobTransport,
  cleanup: CleanupScheduler,
): ServerRuntime {
  return {
    config: {
      mode: "local",
      publicBaseUrl: "http://localhost:3000",
      allowedOrigins: ["http://localhost:3000"],
      sessionTtlMs: 180_000,
      signedUrlTtlMs: 120_000,
      demoEnabled: true,
    },
    sessions,
    blobs,
    cleanup,
  };
}

describe("race-safe encrypted blob cleanup", () => {
  it("keeps a sealed session and its orphan record when blob deletion fails, then retries idempotently", async () => {
    const now = Date.now();
    const sessions = new MemorySessionStore();
    const blobs = new RecordingBlobTransport();
    const scheduler = new RecordingCleanupScheduler();
    const runtime = testRuntime(sessions, blobs, scheduler);
    const fixture = await uploadedFixture(sessions, now);

    blobs.failDelete = true;
    await expect(cleanupSession(runtime, fixture.sessionId, fixture.expiresAt)).rejects.toThrow(
      "simulated blob deletion failure",
    );
    expect((await sessions.get(fixture.sessionId))?.status).toBe("expired");
    expect(await sessions.listDueOrphans(fixture.expiresAt, 10)).toEqual([
      {
        protocolVersion: 1,
        sessionId: fixture.sessionId,
        pathname: fixture.pathname,
        etag: "fixture-etag",
        createdAt: now + 2,
        dueAt: fixture.expiresAt,
      },
    ]);

    blobs.failDelete = false;
    await expect(cleanupSession(runtime, fixture.sessionId, fixture.expiresAt + 1)).resolves.toBe(
      "deleted",
    );
    expect(blobs.deleted).toEqual([{ pathname: fixture.pathname, etag: "fixture-etag" }]);
    expect(await sessions.get(fixture.sessionId)).toBeNull();
    expect(await sessions.listDueOrphans(fixture.expiresAt + 1, 10)).toEqual([]);
    await expect(cleanupSession(runtime, fixture.sessionId, fixture.expiresAt + 2)).resolves.toBe(
      "absent",
    );
  });

  it("uses the persistent orphan ledger after the session record is missing", async () => {
    const now = Date.now();
    const sessions = new MemorySessionStore();
    const blobs = new RecordingBlobTransport();
    const scheduler = new RecordingCleanupScheduler();
    const runtime = testRuntime(sessions, blobs, scheduler);
    const fixture = await uploadedFixture(sessions, now);

    await sessions.remove(fixture.sessionId);
    await expect(cleanupSession(runtime, fixture.sessionId, fixture.expiresAt)).resolves.toBe(
      "deleted",
    );
    expect(blobs.deleted).toEqual([{ pathname: fixture.pathname, etag: "fixture-etag" }]);
    expect(await sessions.getReceipt(fixture.sessionId)).toEqual(
      expect.objectContaining({ sessionId: fixture.sessionId, status: "expired" }),
    );
    expect(await sessions.listDueOrphans(fixture.expiresAt, 10)).toEqual([]);
  });

  it("defers cleanup through consume, validation, and printing leases and extends the lease on progress", async () => {
    const now = Date.now();
    const sessions = new MemorySessionStore();
    const blobs = new RecordingBlobTransport();
    const scheduler = new RecordingCleanupScheduler();
    const runtime = testRuntime(sessions, blobs, scheduler);
    const fixture = await uploadedFixture(sessions, now);
    const consumeAt = fixture.expiresAt - 10;
    const consumed = await sessions.consume(
      fixture.sessionId,
      fixture.kioskTokenHash,
      await hashToken(generateToken(), "kiosk"),
      consumeAt,
      30_000,
    );

    await expect(cleanupSession(runtime, fixture.sessionId, fixture.expiresAt)).resolves.toBe(
      "deferred",
    );
    expect(scheduler.scheduled).toEqual([
      { sessionId: fixture.sessionId, dueAt: consumed.consumeLeaseExpiresAt },
    ]);

    const validating = await sessions.transition(
      fixture.sessionId,
      fixture.kioskTokenHash,
      "validating",
      fixture.expiresAt + 1_000,
    );
    const printing = await sessions.transition(
      fixture.sessionId,
      fixture.kioskTokenHash,
      "printing",
      fixture.expiresAt + 2_000,
    );
    expect(validating.consumeLeaseExpiresAt).toBe(fixture.expiresAt + 121_000);
    expect(printing.consumeLeaseExpiresAt).toBe(fixture.expiresAt + 122_000);

    const deferred = await sessions.prepareCleanup(
      fixture.sessionId,
      consumed.consumeLeaseExpiresAt!,
    );
    expect(deferred).toEqual({ action: "defer", retryAt: printing.consumeLeaseExpiresAt });
    const sealed = await sessions.prepareCleanup(
      fixture.sessionId,
      printing.consumeLeaseExpiresAt!,
    );
    expect(sealed).toEqual(expect.objectContaining({ action: "delete", receiptStatus: "failed" }));
    expect((await sessions.get(fixture.sessionId))?.status).toBe("failed");
  });

  it("sweeps only due orphan records and leaves later records queued", async () => {
    const now = Date.now();
    const sessions = new MemorySessionStore();
    const blobs = new RecordingBlobTransport();
    const scheduler = new RecordingCleanupScheduler();
    const runtime = testRuntime(sessions, blobs, scheduler);
    const first = await uploadedFixture(sessions, now, 1_000);
    const second = await uploadedFixture(sessions, now + 10, 2_000);
    await sessions.remove(first.sessionId);
    await sessions.remove(second.sessionId);

    await expect(sweepDueOrphans(runtime, first.expiresAt, 10)).resolves.toEqual({
      attempted: 1,
      deleted: 1,
      deferred: 0,
      failed: 0,
    });
    expect(blobs.deleted).toEqual([{ pathname: first.pathname, etag: "fixture-etag" }]);
    expect(await sessions.listDueOrphans(first.expiresAt, 10)).toEqual([]);
    expect(await sessions.listDueOrphans(second.expiresAt, 10)).toEqual([
      expect.objectContaining({ sessionId: second.sessionId, pathname: second.pathname }),
    ]);
  });
});
