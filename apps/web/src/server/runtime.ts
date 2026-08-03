import { generateToken, hashToken } from "@print-cess/crypto";
import { MAX_ENVELOPE_BYTES, PROTOCOL_VERSION, type PrintSession } from "@print-cess/protocol";

import { LocalEncryptedBlobTransport } from "./blob/local";
import { S3BlobTransport } from "./blob/s3";
import { VercelBlobTransport } from "./blob/vercel";
import { InProcessCleanupScheduler } from "./cleanup/in-process";
import { PersistentSweepCleanupScheduler } from "./cleanup/persistent-sweep";
import { QStashCleanupScheduler } from "./cleanup/qstash";
import { loadConfig, type ServerConfig } from "./config";
import type { BlobTransport, CleanupScheduler, SessionStore } from "./contracts";
import { MemorySessionStore } from "./session-store/memory";
import { RailwayPostgresSessionStore } from "./session-store/postgres";
import { RailwayRedisSessionStore } from "./session-store/redis";
import { UpstashSessionStore } from "./session-store/upstash";
import { ServiceError } from "./errors";

export type ServerRuntime = {
  config: ServerConfig;
  sessions: SessionStore;
  blobs: BlobTransport;
  cleanup: CleanupScheduler;
};

declare global {
  var __printCessRuntime: ServerRuntime | undefined;
}

export function getRuntime(): ServerRuntime {
  if (globalThis.__printCessRuntime) return globalThis.__printCessRuntime;
  const config = loadConfig();
  let runtime: ServerRuntime;
  if (config.mode === "external") {
    const sessions: SessionStore =
      config.sessionProvider === "railway-redis"
        ? new RailwayRedisSessionStore()
        : config.sessionProvider === "railway-postgres"
          ? new RailwayPostgresSessionStore()
          : new UpstashSessionStore();
    const blobs: BlobTransport =
      config.blobProvider === "railway-s3" ? new S3BlobTransport() : new VercelBlobTransport();
    const cleanup: CleanupScheduler =
      config.cleanupProvider === "railway-worker"
        ? new PersistentSweepCleanupScheduler()
        : new QStashCleanupScheduler(`${config.publicBaseUrl}/api/cleanup`);
    runtime = { config, sessions, blobs, cleanup };
  } else {
    const sessions = new MemorySessionStore();
    const blobs = new LocalEncryptedBlobTransport(config.publicBaseUrl);
    const cleanup = new InProcessCleanupScheduler(async (sessionId) => {
      await cleanupSession(runtime, sessionId);
    });
    runtime = { config, sessions, blobs, cleanup };
  }
  globalThis.__printCessRuntime = runtime;
  return runtime;
}

export async function createPrintSession(input: {
  kioskPublicKey: string;
  kioskPublicKeyFingerprint: string;
}): Promise<{ session: PrintSession; uploadToken: string; kioskToken: string }> {
  const runtime = getRuntime();
  const now = Date.now();
  const sessionId = generateToken(16);
  const uploadToken = generateToken(32);
  const kioskToken = generateToken(32);
  const session: PrintSession = {
    protocolVersion: PROTOCOL_VERSION,
    sessionId,
    status: "waiting",
    kioskPublicKey: input.kioskPublicKey,
    kioskPublicKeyFingerprint: input.kioskPublicKeyFingerprint,
    createdAt: now,
    expiresAt: now + runtime.config.qrTtlMs,
    uploadTokenHash: await hashToken(uploadToken, "upload"),
    kioskTokenHash: await hashToken(kioskToken, "kiosk"),
    revision: 0,
  };
  await runtime.sessions.create(session, runtime.config.qrTtlMs);
  return { session, uploadToken, kioskToken };
}

export function createBlobPath(): string {
  return `v1/${generateToken(16)}.bin`;
}

export function signedExpiry(config: ServerConfig, sessionExpiresAt: number): number {
  return Math.min(sessionExpiresAt, Date.now() + config.signedUrlTtlMs);
}

export type CleanupSessionResult = "absent" | "deferred" | "deleted";

export async function cleanupSession(
  runtime: ServerRuntime,
  sessionId: string,
  now = Date.now(),
): Promise<CleanupSessionResult> {
  const preparation = await runtime.sessions.prepareCleanup(sessionId, now);
  if (preparation.action === "absent") return "absent";
  if (preparation.action === "defer") {
    await runtime.cleanup.schedule(sessionId, preparation.retryAt);
    return "deferred";
  }

  if (preparation.orphan) {
    await runtime.blobs.delete(preparation.orphan.pathname, preparation.orphan.etag);
  }
  await runtime.sessions.putReceipt({
    protocolVersion: 1,
    sessionId,
    status: preparation.receiptStatus,
    expiresAt: now + 15_000,
  });
  const finalized = await runtime.sessions.finalizeCleanup(
    sessionId,
    preparation.sealedRevision,
    preparation.orphan?.pathname ?? null,
  );
  if (!finalized) {
    throw new ServiceError("conflict", "Cleanup state changed before it could be finalized.", 409);
  }
  return "deleted";
}

export type OrphanSweepResult = {
  attempted: number;
  deleted: number;
  deferred: number;
  failed: number;
};

export async function sweepDueOrphans(
  runtime: ServerRuntime,
  now = Date.now(),
  limit = 10,
): Promise<OrphanSweepResult> {
  const due = await runtime.sessions.listDueOrphans(now, limit);
  const result: OrphanSweepResult = { attempted: due.length, deleted: 0, deferred: 0, failed: 0 };
  for (const orphan of due) {
    try {
      const outcome = await cleanupSession(runtime, orphan.sessionId, now);
      if (outcome === "deleted" || outcome === "absent") result.deleted += 1;
      else result.deferred += 1;
    } catch {
      result.failed += 1;
    }
  }
  return result;
}

export { MAX_ENVELOPE_BYTES };
