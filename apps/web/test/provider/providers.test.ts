import { afterEach, describe, expect, it } from "vitest";

import { generateToken, hashToken } from "@print-cess/crypto";
import type { PrintSession } from "@print-cess/protocol";

import { VercelBlobTransport } from "@/server/blob/vercel";
import { QStashCleanupScheduler } from "@/server/cleanup/qstash";
import { UpstashSessionStore } from "@/server/session-store/upstash";

const suite = process.env.PROVIDER_TEST_SUITE ?? "all";
const enabled = (name: "blob" | "redis" | "qstash") => suite === "all" || suite === name;
const cleanupTasks: Array<() => Promise<void>> = [];

afterEach(async () => {
  for (const cleanup of cleanupTasks.splice(0).reverse()) {
    await cleanup();
  }
});

describe.runIf(enabled("redis"))("approved Preview Upstash Redis", () => {
  it("admits one claimant and consumer, preserves terminal state, and cleans atomically", async () => {
    const store = new UpstashSessionStore();
    const now = Date.now();
    const uploadToken = generateToken();
    const kioskToken = generateToken();
    const firstMobileToken = generateToken();
    const secondMobileToken = generateToken();
    const session: PrintSession = {
      protocolVersion: 1,
      sessionId: generateToken(16),
      status: "waiting",
      kioskPublicKey: `B${"A".repeat(86)}`,
      kioskPublicKeyFingerprint: "A".repeat(43),
      createdAt: now,
      expiresAt: now + 60_000,
      uploadTokenHash: await hashToken(uploadToken, "upload"),
      kioskTokenHash: await hashToken(kioskToken, "kiosk"),
      revision: 0,
    };

    await store.create(session, 60_000);
    cleanupTasks.push(() => forceCleanup(store, session.sessionId));

    const firstMobileHash = await hashToken(firstMobileToken, "mobile");
    const secondMobileHash = await hashToken(secondMobileToken, "mobile");
    const claims = await Promise.allSettled([
      store.claim(
        session.sessionId,
        session.uploadTokenHash,
        firstMobileHash,
        await hashToken(generateToken(), "mobile"),
        now + 1,
        60_000,
      ),
      store.claim(
        session.sessionId,
        session.uploadTokenHash,
        secondMobileHash,
        await hashToken(generateToken(), "mobile"),
        now + 1,
        60_000,
      ),
    ]);
    expect(claims.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(claims.filter((result) => result.status === "rejected")).toHaveLength(1);

    const claimed = await store.get(session.sessionId);
    expect(claimed?.status).toBe("claimed");
    const winningMobileHash = claimed?.mobileTokenHash;
    if (!winningMobileHash) throw new Error("The winning mobile claim was not persisted.");

    const pathname = `v1/${generateToken(16)}.bin`;
    const authorized = await store.authorizeUpload(
      session.sessionId,
      winningMobileHash,
      await hashToken(generateToken(), "mobile"),
      pathname,
      now + 2,
      now + 60_000,
    );
    expect(authorized.newlyAuthorized).toBe(true);
    await store.markUploading(session.sessionId, winningMobileHash, now + 3);
    await store.markUploaded(
      session.sessionId,
      winningMobileHash,
      { etag: "synthetic-provider-etag", size: 512 },
      now + 4,
    );

    const consumes = await Promise.allSettled([
      store.consume(
        session.sessionId,
        session.kioskTokenHash,
        await hashToken(generateToken(), "kiosk"),
        now + 5,
        30_000,
      ),
      store.consume(
        session.sessionId,
        session.kioskTokenHash,
        await hashToken(generateToken(), "kiosk"),
        now + 5,
        30_000,
      ),
    ]);
    expect(consumes.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(consumes.filter((result) => result.status === "rejected")).toHaveLength(1);

    const deferred = await store.prepareCleanup(session.sessionId, now + 60_000);
    expect(deferred).toEqual(
      expect.objectContaining({ action: "defer", retryAt: expect.any(Number) }),
    );
    await store.transition(session.sessionId, session.kioskTokenHash, "validating", now + 6);
    await store.transition(session.sessionId, session.kioskTokenHash, "printing", now + 7);
    await store.transition(session.sessionId, session.kioskTokenHash, "completed", now + 8);
    await expect(
      store.transition(session.sessionId, session.kioskTokenHash, "failed", now + 9),
    ).rejects.toThrow();

    const preparation = await store.prepareCleanup(session.sessionId, now + 10);
    expect(preparation).toEqual(
      expect.objectContaining({
        action: "delete",
        receiptStatus: "completed",
        orphan: expect.objectContaining({ pathname }),
      }),
    );
    if (preparation.action !== "delete") throw new Error("Cleanup did not seal the session.");
    await expect(
      store.finalizeCleanup(
        session.sessionId,
        preparation.sealedRevision,
        preparation.orphan?.pathname ?? null,
      ),
    ).resolves.toBe(true);
    expect(await store.get(session.sessionId)).toBeNull();
    cleanupTasks.pop();
  });

  it("never deletes a session after a consume wins the expiry cleanup race", async () => {
    const store = new UpstashSessionStore();
    const fixture = await createUploadedRedisSession(store);
    cleanupTasks.push(() => forceCleanup(store, fixture.session.sessionId));

    const [consumeResult, cleanupResult] = await Promise.allSettled([
      store.consume(
        fixture.session.sessionId,
        fixture.session.kioskTokenHash,
        await hashToken(generateToken(), "kiosk"),
        fixture.expiresAt - 1,
        30_000,
      ),
      store.prepareCleanup(fixture.session.sessionId, fixture.expiresAt),
    ]);

    expect(cleanupResult.status).toBe("fulfilled");
    if (cleanupResult.status !== "fulfilled") throw new Error("Cleanup race did not settle.");
    if (consumeResult.status === "fulfilled") {
      expect(cleanupResult.value).toEqual(
        expect.objectContaining({ action: "defer", retryAt: expect.any(Number) }),
      );
      expect((await store.get(fixture.session.sessionId))?.status).toBe("consumed");
    } else {
      expect(cleanupResult.value).toEqual(
        expect.objectContaining({ action: "delete", receiptStatus: "expired" }),
      );
      if (cleanupResult.value.action !== "delete") {
        throw new Error("The losing consume was not paired with sealed cleanup.");
      }
      await expect(
        store.finalizeCleanup(
          fixture.session.sessionId,
          cleanupResult.value.sealedRevision,
          cleanupResult.value.orphan?.pathname ?? null,
        ),
      ).resolves.toBe(true);
      cleanupTasks.pop();
    }
  });
});

describe.runIf(enabled("blob"))("approved Preview Vercel Private Blob", () => {
  it("enforces direct-operation scope, constraints, ETag cleanup, and no overwrite", async () => {
    const transport = new VercelBlobTransport();
    const pathname = `v1/${generateToken(16)}.bin`;
    const body = crypto.getRandomValues(new Uint8Array(512));
    cleanupTasks.push(async () => {
      try {
        await transport.delete(pathname);
      } catch {
        // The test may already have deleted the synthetic object.
      }
    });

    const upload = await transport.authorizeUpload(pathname, Date.now() + 60_000, body.byteLength);
    const wrongMethod = await fetch(upload.url, { method: "GET", cache: "no-store" });
    expect(wrongMethod.ok).toBe(false);

    const wrongPathUrl = new URL(upload.url);
    wrongPathUrl.pathname = `${wrongPathUrl.pathname}.synthetic-other`;
    const wrongPath = await fetch(wrongPathUrl, {
      method: "PUT",
      headers: upload.headers,
      body,
    });
    expect(wrongPath.ok).toBe(false);

    const wrongContentType = await fetch(upload.url, {
      method: "PUT",
      headers: { "Content-Type": "text/plain" },
      body,
    });
    expect(wrongContentType.ok).toBe(false);

    const freshUpload = await transport.authorizeUpload(
      pathname,
      Date.now() + 60_000,
      body.byteLength,
    );
    const uploaded = await fetch(freshUpload.url, {
      method: "PUT",
      headers: freshUpload.headers,
      body,
    });
    expect(uploaded.ok).toBe(true);

    const metadata = await transport.head(pathname);
    const committedEtag = metadata.etag;
    expect(metadata.size).toBe(body.byteLength);

    const overwrite = await fetch(freshUpload.url, {
      method: "PUT",
      headers: freshUpload.headers,
      body,
    });
    expect(overwrite.ok).toBe(false);

    const download = await transport.authorizeDownload(pathname, Date.now() + 60_000);
    const downloaded = await fetch(download.url, { method: "GET", cache: "no-store" });
    expect(downloaded.ok).toBe(true);
    expect(new Uint8Array(await downloaded.arrayBuffer())).toEqual(body);
    const downloadAsPut = await fetch(download.url, {
      method: "PUT",
      headers: { "Content-Type": "application/octet-stream" },
      body,
    });
    expect(downloadAsPut.ok).toBe(false);

    await expect(transport.delete(pathname, "synthetic-wrong-etag")).rejects.toThrow();
    expect((await transport.head(pathname)).etag).toBe(committedEtag);
    await transport.delete(pathname, committedEtag);
    await expect(transport.head(pathname)).rejects.toThrow();
    await expect(transport.delete(pathname)).resolves.toBeUndefined();
    cleanupTasks.pop();
  });

  it("rejects a body above the delegated maximum", async () => {
    const transport = new VercelBlobTransport();
    const pathname = `v1/${generateToken(16)}.bin`;
    const upload = await transport.authorizeUpload(pathname, Date.now() + 60_000, 511);
    const oversized = await fetch(upload.url, {
      method: "PUT",
      headers: upload.headers,
      body: crypto.getRandomValues(new Uint8Array(512)),
    });
    expect(oversized.ok).toBe(false);
    await expect(transport.head(pathname)).rejects.toThrow();
  });

  it("rejects an expired upload delegation", async () => {
    const transport = new VercelBlobTransport();
    const pathname = `v1/${generateToken(16)}.bin`;
    const upload = await transport.authorizeUpload(pathname, Date.now() + 2_000, 512);
    await new Promise((resolve) => setTimeout(resolve, 3_000));
    const expired = await fetch(upload.url, {
      method: "PUT",
      headers: upload.headers,
      body: crypto.getRandomValues(new Uint8Array(512)),
    });
    expect(expired.ok).toBe(false);
    await expect(transport.head(pathname)).rejects.toThrow();
  });
});

describe.runIf(enabled("qstash"))("approved Preview Upstash QStash", () => {
  it("delivers a signed delayed cleanup to the Preview endpoint", async () => {
    const store = new UpstashSessionStore();
    const now = Date.now();
    const expiresAt = now + 8_000;
    const session: PrintSession = {
      protocolVersion: 1,
      sessionId: generateToken(16),
      status: "waiting",
      kioskPublicKey: `B${"A".repeat(86)}`,
      kioskPublicKeyFingerprint: "A".repeat(43),
      createdAt: now,
      expiresAt,
      uploadTokenHash: await hashToken(generateToken(), "upload"),
      kioskTokenHash: await hashToken(generateToken(), "kiosk"),
      revision: 0,
    };
    await store.create(session, expiresAt - now);
    cleanupTasks.push(() => forceCleanup(store, session.sessionId));

    const baseUrl = process.env.PROVIDER_BASE_URL;
    if (!baseUrl) throw new Error("The approved Preview origin is unavailable.");
    const scheduler = new QStashCleanupScheduler(`${baseUrl}/api/cleanup`);
    await scheduler.schedule(session.sessionId, expiresAt);

    const receipt = await poll(async () => store.getReceipt(session.sessionId), 35_000);
    expect(receipt).toEqual(
      expect.objectContaining({ sessionId: session.sessionId, status: "expired" }),
    );
    expect(await store.get(session.sessionId)).toBeNull();
    cleanupTasks.pop();
  });
});

async function forceCleanup(store: UpstashSessionStore, sessionId: string): Promise<void> {
  const preparation = await store.prepareCleanup(sessionId, Date.now() + 10 * 60_000);
  if (preparation.action !== "delete") return;
  await store.finalizeCleanup(
    sessionId,
    preparation.sealedRevision,
    preparation.orphan?.pathname ?? null,
  );
}

async function createUploadedRedisSession(store: UpstashSessionStore): Promise<{
  session: PrintSession;
  expiresAt: number;
}> {
  const now = Date.now();
  const session: PrintSession = {
    protocolVersion: 1,
    sessionId: generateToken(16),
    status: "waiting",
    kioskPublicKey: `B${"A".repeat(86)}`,
    kioskPublicKeyFingerprint: "A".repeat(43),
    createdAt: now,
    expiresAt: now + 60_000,
    uploadTokenHash: await hashToken(generateToken(), "upload"),
    kioskTokenHash: await hashToken(generateToken(), "kiosk"),
    revision: 0,
  };
  await store.create(session, 60_000);
  const mobileHash = await hashToken(generateToken(), "mobile");
  const claimed = await store.claim(
    session.sessionId,
    session.uploadTokenHash,
    mobileHash,
    await hashToken(generateToken(), "mobile"),
    now + 1,
    60_000,
  );
  await store.authorizeUpload(
    session.sessionId,
    mobileHash,
    await hashToken(generateToken(), "mobile"),
    `v1/${generateToken(16)}.bin`,
    now + 2,
    claimed.expiresAt,
  );
  await store.markUploading(session.sessionId, mobileHash, now + 3);
  await store.markUploaded(
    session.sessionId,
    mobileHash,
    { etag: "synthetic-race-etag", size: 512 },
    now + 4,
  );
  return { session, expiresAt: claimed.expiresAt };
}

async function poll<T>(read: () => Promise<T | null>, timeoutMs: number): Promise<T | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await read();
    if (value !== null) return value;
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  return null;
}
