import { timingSafeEqualBase64Url } from "@print-cess/crypto";
import {
  TERMINAL_SESSION_STATUSES,
  assertTransition,
  type PrintSession,
  type PrintSessionStatus,
} from "@print-cess/protocol";

import type {
  BlobOrphanRecord,
  CleanupPreparation,
  SessionReceipt,
  SessionStore,
  UploadAuthorizationResult,
} from "../contracts";
import { ServiceError } from "../errors";

type StoredSession = { session: PrintSession; retentionExpiresAt: number };

const CLEANUP_RETENTION_MS = 5 * 60_000;
const PROCESSING_LEASE_MS = 2 * 60_000;
const PROCESSING_STATUSES = new Set<PrintSessionStatus>(["consumed", "validating", "printing"]);

export class MemorySessionStore implements SessionStore {
  readonly #sessions = new Map<string, StoredSession>();
  readonly #receipts = new Map<string, SessionReceipt>();
  readonly #orphans = new Map<string, BlobOrphanRecord>();

  public async create(session: PrintSession, ttlMs: number): Promise<void> {
    this.prune();
    if (this.#sessions.has(session.sessionId) || this.#orphans.has(session.sessionId)) {
      throw new ServiceError("conflict", "A session with this identifier already exists.", 409);
    }
    this.#sessions.set(session.sessionId, {
      session: structuredClone(session),
      retentionExpiresAt: Date.now() + ttlMs + 5 * 60_000,
    });
  }

  public async get(sessionId: string): Promise<PrintSession | null> {
    this.prune();
    const stored = this.#sessions.get(sessionId);
    return stored ? structuredClone(stored.session) : null;
  }

  public async claim(
    sessionId: string,
    uploadTokenHash: string,
    mobileTokenHash: string,
    claimIdHash: string,
    now: number,
    ttlMs: number,
  ): Promise<PrintSession> {
    return this.mutate(sessionId, now, (session) => {
      requireHash(session.uploadTokenHash, uploadTokenHash);
      if (session.status === "claimed") {
        if (
          timingSafeEqualBase64Url(session.claimIdHash ?? "", claimIdHash) &&
          timingSafeEqualBase64Url(session.mobileTokenHash ?? "", mobileTokenHash)
        ) {
          return session;
        }
        throw new ServiceError("conflict", "This QR code has already been claimed.", 409);
      }
      assertTransition(session.status, "claimed");
      return {
        ...session,
        status: "claimed",
        mobileTokenHash,
        claimIdHash,
        claimedAt: now,
        expiresAt: now + ttlMs,
        revision: session.revision + 1,
      };
    });
  }

  public async authorizeUpload(
    sessionId: string,
    mobileTokenHash: string,
    operationIdHash: string,
    blobPath: string,
    now: number,
    cleanupDueAt: number,
  ): Promise<UploadAuthorizationResult> {
    this.prune(now);
    const stored = this.requireMutableSession(sessionId, now);
    const session = structuredClone(stored.session);
    requireHash(session.mobileTokenHash, mobileTokenHash);
    if (session.status === "upload_authorized") {
      if (!timingSafeEqualBase64Url(session.uploadOperationIdHash ?? "", operationIdHash)) {
        throw new ServiceError("conflict", "Upload authorization has already been used.", 409);
      }
      return { session, newlyAuthorized: false };
    }
    assertTransition(session.status, "upload_authorized");
    const next: PrintSession = {
      ...session,
      status: "upload_authorized",
      encryptedBlobPath: blobPath,
      uploadOperationIdHash: operationIdHash,
      revision: session.revision + 1,
    };
    const orphan: BlobOrphanRecord = {
      protocolVersion: 1,
      sessionId,
      pathname: blobPath,
      createdAt: now,
      dueAt: cleanupDueAt,
    };
    stored.session = structuredClone(next);
    stored.retentionExpiresAt = retentionDeadline(next, now);
    this.#orphans.set(sessionId, structuredClone(orphan));
    return { session: structuredClone(next), newlyAuthorized: true };
  }

  public async markUploading(
    sessionId: string,
    mobileTokenHash: string,
    now: number,
  ): Promise<PrintSession> {
    return this.mutate(sessionId, now, (session) => {
      requireHash(session.mobileTokenHash, mobileTokenHash);
      if (session.status === "uploading") return session;
      assertTransition(session.status, "uploading");
      return { ...session, status: "uploading", revision: session.revision + 1 };
    });
  }

  public async markUploaded(
    sessionId: string,
    mobileTokenHash: string,
    metadata: { etag: string; size: number },
    now: number,
  ): Promise<PrintSession> {
    return this.mutate(sessionId, now, (session) => {
      requireHash(session.mobileTokenHash, mobileTokenHash);
      if (session.status === "uploaded") {
        if (
          session.encryptedBlobEtag === metadata.etag &&
          session.encryptedBlobSize === metadata.size
        )
          return session;
        throw new ServiceError("conflict", "A different upload has already been committed.", 409);
      }
      assertTransition(session.status, "uploaded");
      const orphan = this.#orphans.get(sessionId);
      if (!orphan || orphan.pathname !== session.encryptedBlobPath) {
        throw new ServiceError(
          "unavailable",
          "Encrypted blob cleanup tracking is unavailable.",
          503,
        );
      }
      orphan.etag = metadata.etag;
      return {
        ...session,
        status: "uploaded",
        encryptedBlobEtag: metadata.etag,
        encryptedBlobSize: metadata.size,
        revision: session.revision + 1,
      };
    });
  }

  public async consume(
    sessionId: string,
    kioskTokenHash: string,
    consumeIdHash: string,
    now: number,
    leaseMs: number,
  ): Promise<PrintSession> {
    return this.mutate(sessionId, now, (session) => {
      requireHash(session.kioskTokenHash, kioskTokenHash);
      if (session.status === "consumed") {
        if (
          timingSafeEqualBase64Url(session.consumeIdHash ?? "", consumeIdHash) &&
          (session.consumeLeaseExpiresAt ?? 0) > now
        ) {
          return session;
        }
        throw new ServiceError("conflict", "This document has already been consumed.", 409);
      }
      assertTransition(session.status, "consumed");
      return {
        ...session,
        status: "consumed",
        consumeIdHash,
        consumeLeaseExpiresAt: now + leaseMs,
        revision: session.revision + 1,
      };
    });
  }

  public async transition(
    sessionId: string,
    kioskTokenHash: string,
    next: PrintSessionStatus,
    now: number,
  ): Promise<PrintSession> {
    return this.mutate(sessionId, now, (session) => {
      requireHash(session.kioskTokenHash, kioskTokenHash);
      assertTransition(session.status, next);
      return {
        ...session,
        status: next,
        ...(next === "validating" || next === "printing"
          ? { consumeLeaseExpiresAt: now + PROCESSING_LEASE_MS }
          : {}),
        ...(next === "completed" ? { completedAt: now } : {}),
        revision: session.revision + 1,
      };
    });
  }

  public async cancel(
    sessionId: string,
    candidateTokenHash: string,
    role: "mobile" | "kiosk",
    now: number,
  ): Promise<PrintSession> {
    return this.mutate(sessionId, now, (session) => {
      requireHash(
        role === "mobile" ? session.mobileTokenHash : session.kioskTokenHash,
        candidateTokenHash,
      );
      assertTransition(session.status, "cancelled");
      return { ...session, status: "cancelled", revision: session.revision + 1 };
    });
  }

  public async remove(sessionId: string): Promise<void> {
    this.#sessions.delete(sessionId);
  }

  public async putReceipt(receipt: SessionReceipt): Promise<void> {
    this.#receipts.set(receipt.sessionId, structuredClone(receipt));
  }

  public async getReceipt(sessionId: string): Promise<SessionReceipt | null> {
    this.prune();
    const receipt = this.#receipts.get(sessionId);
    return receipt ? structuredClone(receipt) : null;
  }

  public async prepareCleanup(sessionId: string, now: number): Promise<CleanupPreparation> {
    this.prune(now);
    const stored = this.#sessions.get(sessionId);
    let orphan = this.#orphans.get(sessionId);
    if (!stored) {
      return orphan
        ? {
            action: "delete",
            orphan: structuredClone(orphan),
            receiptStatus: "expired",
            sealedRevision: null,
          }
        : { action: "absent" };
    }

    let session = structuredClone(stored.session);
    if (!orphan && session.encryptedBlobPath) {
      orphan = {
        protocolVersion: 1,
        sessionId,
        pathname: session.encryptedBlobPath,
        ...(session.encryptedBlobEtag ? { etag: session.encryptedBlobEtag } : {}),
        createdAt: now,
        dueAt: Math.max(now, session.expiresAt),
      };
      this.#orphans.set(sessionId, orphan);
    }

    if (!TERMINAL_SESSION_STATUSES.has(session.status)) {
      const processingLease = PROCESSING_STATUSES.has(session.status)
        ? (session.consumeLeaseExpiresAt ?? 0)
        : 0;
      const retryAt = Math.max(session.expiresAt, processingLease);
      if (retryAt > now) {
        if (orphan && orphan.dueAt !== retryAt) orphan.dueAt = retryAt;
        return { action: "defer", retryAt };
      }

      const terminalStatus: PrintSessionStatus =
        session.status === "validating" || session.status === "printing" ? "failed" : "expired";
      assertTransition(session.status, terminalStatus);
      session = {
        ...session,
        status: terminalStatus,
        revision: session.revision + 1,
      };
      stored.session = structuredClone(session);
    }
    stored.retentionExpiresAt = Math.max(stored.retentionExpiresAt, now + CLEANUP_RETENTION_MS);

    return {
      action: "delete",
      orphan: orphan ? structuredClone(orphan) : null,
      receiptStatus: terminalReceiptStatus(session.status),
      sealedRevision: session.revision,
    };
  }

  public async finalizeCleanup(
    sessionId: string,
    sealedRevision: number | null,
    pathname: string | null,
  ): Promise<boolean> {
    const stored = this.#sessions.get(sessionId);
    if (stored) {
      if (
        sealedRevision === null ||
        stored.session.revision !== sealedRevision ||
        !TERMINAL_SESSION_STATUSES.has(stored.session.status)
      ) {
        return false;
      }
    }

    const orphan = this.#orphans.get(sessionId);
    if (orphan && (!pathname || orphan.pathname !== pathname)) return false;
    if (!orphan && pathname && stored) return false;

    this.#sessions.delete(sessionId);
    if (orphan) this.#orphans.delete(sessionId);
    return true;
  }

  public async listDueOrphans(now: number, limit: number): Promise<BlobOrphanRecord[]> {
    this.prune(now);
    const boundedLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
    return [...this.#orphans.values()]
      .filter((orphan) => orphan.dueAt <= now)
      .sort(
        (left, right) => left.dueAt - right.dueAt || left.sessionId.localeCompare(right.sessionId),
      )
      .slice(0, boundedLimit)
      .map((orphan) => structuredClone(orphan));
  }

  private async mutate(
    sessionId: string,
    now: number,
    mutation: (session: PrintSession) => PrintSession,
  ): Promise<PrintSession> {
    this.prune(now);
    const stored = this.requireMutableSession(sessionId, now);
    const next = mutation(structuredClone(stored.session));
    stored.session = structuredClone(next);
    stored.retentionExpiresAt = retentionDeadline(next, now);
    return structuredClone(next);
  }

  private requireMutableSession(sessionId: string, now: number): StoredSession {
    const stored = this.#sessions.get(sessionId);
    if (!stored) throw new ServiceError("not_found", "The print session was not found.", 404);
    const processingLeaseActive =
      PROCESSING_STATUSES.has(stored.session.status) &&
      (stored.session.consumeLeaseExpiresAt ?? 0) > now;
    if (stored.session.expiresAt <= now && !processingLeaseActive) {
      throw new ServiceError("expired", "The print session has expired.", 410);
    }
    return stored;
  }

  private prune(now = Date.now()): void {
    for (const [sessionId, stored] of this.#sessions) {
      if (stored.retentionExpiresAt <= now) this.#sessions.delete(sessionId);
    }
    for (const [sessionId, receipt] of this.#receipts) {
      if (receipt.expiresAt <= now) this.#receipts.delete(sessionId);
    }
  }
}

function retentionDeadline(session: PrintSession, now: number): number {
  return Math.max(
    now + 60_000,
    session.expiresAt + CLEANUP_RETENTION_MS,
    (session.consumeLeaseExpiresAt ?? 0) + CLEANUP_RETENTION_MS,
  );
}

function terminalReceiptStatus(status: PrintSessionStatus): SessionReceipt["status"] {
  if (
    status === "completed" ||
    status === "failed" ||
    status === "expired" ||
    status === "cancelled"
  ) {
    return status;
  }
  throw new ServiceError("conflict", "The session was not sealed for cleanup.", 409);
}

function requireHash(expected: string | undefined, candidate: string): void {
  if (!expected || !timingSafeEqualBase64Url(expected, candidate)) {
    throw new ServiceError("unauthorized", "The session credential is invalid.", 401);
  }
}
