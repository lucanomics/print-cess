import { timingSafeEqualBase64Url } from "@print-cess/crypto";
import {
  ENCRYPTED_BLOB_PATH_PATTERN,
  SESSION_ID_PATTERN,
  TERMINAL_SESSION_STATUSES,
  assertTransition,
  printSessionSchema,
  type PrintSession,
  type PrintSessionStatus,
} from "@print-cess/protocol";
import type { QueryResultRow } from "pg";
import { z } from "zod";

import type {
  BlobOrphanRecord,
  CleanupPreparation,
  SessionReceipt,
  SessionStore,
  UploadAuthorizationResult,
} from "../contracts";
import { ServiceError } from "../errors";
import {
  createPostgresExecutor,
  POSTGRES_STATE_TABLE,
  type PostgresExecutor,
  type PostgresQueryClient,
} from "./postgres-client";

type PersistentState = {
  session: PrintSession | null;
  retentionExpiresAt: number | null;
  orphan: BlobOrphanRecord | null;
  receipt: SessionReceipt | null;
  receiptExpiresAt: number | null;
};

type StateRow = QueryResultRow & {
  session: unknown | null;
  retention_expires_at: string | number | null;
  orphan: unknown | null;
  receipt: unknown | null;
  receipt_expires_at: string | number | null;
};

type OrphanRow = QueryResultRow & { orphan: unknown };

const CLEANUP_RETENTION_MS = 5 * 60_000;
const PROCESSING_LEASE_MS = 2 * 60_000;
const PROCESSING_STATUSES = new Set<PrintSessionStatus>(["consumed", "validating", "printing"]);
const blobOrphanSchema = z
  .object({
    protocolVersion: z.literal(1),
    sessionId: z.string().regex(SESSION_ID_PATTERN),
    pathname: z.string().regex(ENCRYPTED_BLOB_PATH_PATTERN),
    etag: z.string().min(1).max(256).optional(),
    createdAt: z.number().int().nonnegative(),
    dueAt: z.number().int().positive(),
  })
  .strict();
const sessionReceiptSchema = z
  .object({
    protocolVersion: z.literal(1),
    sessionId: z.string().regex(SESSION_ID_PATTERN),
    status: z.enum(["completed", "failed", "expired", "cancelled"]),
    expiresAt: z.number().int().positive(),
  })
  .strict();

/**
 * PostgreSQL-backed SessionStore for the no-cost Preview stack.
 *
 * A single row contains the session, orphan ledger entry, and short-lived
 * receipt for one session id. Every state transition runs under a transaction
 * plus a per-session advisory lock, preserving the same atomic CAS boundary as
 * the Redis Lua implementation while allowing an existing Railway PostgreSQL
 * database to be reused without provisioning another service.
 */
export class RailwayPostgresSessionStore implements SessionStore {
  public constructor(private readonly database: PostgresExecutor = createPostgresExecutor()) {}

  public async create(session: PrintSession, ttlMs: number): Promise<void> {
    await this.withState(session.sessionId, Date.now(), (state) => {
      if (state.session || state.orphan) {
        throw new ServiceError("conflict", "A session with this identifier already exists.", 409);
      }
      state.session = structuredClone(session);
      state.retentionExpiresAt = Date.now() + ttlMs + CLEANUP_RETENTION_MS;
    });
  }

  public async get(sessionId: string): Promise<PrintSession | null> {
    return this.withState(sessionId, Date.now(), (state) =>
      state.session ? structuredClone(state.session) : null,
    );
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
    return this.withState(sessionId, now, (state) => {
      const session = requireMutableSession(state, now);
      requireHash(session.mobileTokenHash, mobileTokenHash);
      if (session.status === "upload_authorized") {
        if (!timingSafeEqualBase64Url(session.uploadOperationIdHash ?? "", operationIdHash)) {
          throw new ServiceError("conflict", "Upload authorization has already been used.", 409);
        }
        return { session: structuredClone(session), newlyAuthorized: false };
      }
      assertTransition(session.status, "upload_authorized");
      const next: PrintSession = {
        ...session,
        status: "upload_authorized",
        encryptedBlobPath: blobPath,
        uploadOperationIdHash: operationIdHash,
        revision: session.revision + 1,
      };
      state.session = structuredClone(next);
      state.retentionExpiresAt = retentionDeadline(next, now);
      state.orphan = {
        protocolVersion: 1,
        sessionId,
        pathname: blobPath,
        createdAt: now,
        dueAt: cleanupDueAt,
      };
      return { session: structuredClone(next), newlyAuthorized: true };
    });
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
    return this.withState(sessionId, now, (state) => {
      const session = requireMutableSession(state, now);
      requireHash(session.mobileTokenHash, mobileTokenHash);
      if (session.status === "uploaded") {
        if (
          session.encryptedBlobEtag === metadata.etag &&
          session.encryptedBlobSize === metadata.size
        ) {
          return structuredClone(session);
        }
        throw new ServiceError("conflict", "A different upload has already been committed.", 409);
      }
      assertTransition(session.status, "uploaded");
      if (!state.orphan || state.orphan.pathname !== session.encryptedBlobPath) {
        throw new ServiceError(
          "unavailable",
          "Encrypted blob cleanup tracking is unavailable.",
          503,
        );
      }
      state.orphan = { ...state.orphan, etag: metadata.etag };
      const next: PrintSession = {
        ...session,
        status: "uploaded",
        encryptedBlobEtag: metadata.etag,
        encryptedBlobSize: metadata.size,
        revision: session.revision + 1,
      };
      state.session = structuredClone(next);
      state.retentionExpiresAt = retentionDeadline(next, now);
      return structuredClone(next);
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
    await this.withState(sessionId, Date.now(), (state) => {
      state.session = null;
      state.retentionExpiresAt = null;
    });
  }

  public async putReceipt(receipt: SessionReceipt): Promise<void> {
    await this.withState(receipt.sessionId, Date.now(), (state) => {
      state.receipt = structuredClone(receipt);
      state.receiptExpiresAt = receipt.expiresAt;
    });
  }

  public async getReceipt(sessionId: string): Promise<SessionReceipt | null> {
    return this.withState(sessionId, Date.now(), (state) =>
      state.receipt ? structuredClone(state.receipt) : null,
    );
  }

  public async prepareCleanup(sessionId: string, now: number): Promise<CleanupPreparation> {
    return this.withState(sessionId, now, (state) => {
      if (!state.session) {
        return state.orphan
          ? {
              action: "delete",
              orphan: structuredClone(state.orphan),
              receiptStatus: "expired",
              sealedRevision: null,
            }
          : { action: "absent" };
      }

      let session = structuredClone(state.session);
      if (!state.orphan && session.encryptedBlobPath) {
        state.orphan = {
          protocolVersion: 1,
          sessionId,
          pathname: session.encryptedBlobPath,
          ...(session.encryptedBlobEtag ? { etag: session.encryptedBlobEtag } : {}),
          createdAt: now,
          dueAt: Math.max(now, session.expiresAt),
        };
      }

      if (!TERMINAL_SESSION_STATUSES.has(session.status)) {
        const processingLease = PROCESSING_STATUSES.has(session.status)
          ? (session.consumeLeaseExpiresAt ?? 0)
          : 0;
        const retryAt = Math.max(session.expiresAt, processingLease);
        if (retryAt > now) {
          if (state.orphan && state.orphan.dueAt !== retryAt) {
            state.orphan = { ...state.orphan, dueAt: retryAt };
          }
          return { action: "defer", retryAt };
        }

        const terminalStatus: PrintSessionStatus =
          session.status === "validating" || session.status === "printing" ? "failed" : "expired";
        assertTransition(session.status, terminalStatus);
        session = { ...session, status: terminalStatus, revision: session.revision + 1 };
        state.session = structuredClone(session);
      }
      state.retentionExpiresAt = Math.max(
        state.retentionExpiresAt ?? 0,
        now + CLEANUP_RETENTION_MS,
      );
      return {
        action: "delete",
        orphan: state.orphan ? structuredClone(state.orphan) : null,
        receiptStatus: terminalReceiptStatus(session.status),
        sealedRevision: session.revision,
      };
    });
  }

  public async finalizeCleanup(
    sessionId: string,
    sealedRevision: number | null,
    pathname: string | null,
  ): Promise<boolean> {
    return this.withState(sessionId, Date.now(), (state) => {
      if (state.session) {
        if (
          sealedRevision === null ||
          state.session.revision !== sealedRevision ||
          !TERMINAL_SESSION_STATUSES.has(state.session.status)
        ) {
          return false;
        }
      }
      if (state.orphan && (!pathname || state.orphan.pathname !== pathname)) return false;
      if (!state.orphan && pathname && state.session) return false;
      state.session = null;
      state.retentionExpiresAt = null;
      state.orphan = null;
      return true;
    });
  }

  public async listDueOrphans(now: number, limit: number): Promise<BlobOrphanRecord[]> {
    await this.pruneExpired(now);
    const boundedLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
    const result = await this.database.query<OrphanRow>(
      `
        SELECT orphan
        FROM ${POSTGRES_STATE_TABLE}
        WHERE orphan IS NOT NULL AND orphan_due_at <= $1
        ORDER BY orphan_due_at ASC, session_id ASC
        LIMIT $2
      `,
      [now, boundedLimit],
    );
    return result.rows.map((row) => parseOrphan(row.orphan));
  }

  private async mutate(
    sessionId: string,
    now: number,
    mutation: (session: PrintSession) => PrintSession,
  ): Promise<PrintSession> {
    return this.withState(sessionId, now, (state) => {
      const session = requireMutableSession(state, now);
      const next = mutation(structuredClone(session));
      state.session = structuredClone(next);
      state.retentionExpiresAt = retentionDeadline(next, now);
      return structuredClone(next);
    });
  }

  private async withState<T>(
    sessionId: string,
    now: number,
    action: (state: PersistentState) => T | Promise<T>,
  ): Promise<T> {
    return this.database.transaction(sessionId, async (client) => {
      const state = await loadState(client, sessionId);
      pruneState(state, now);
      const result = await action(state);
      await persistState(client, sessionId, state);
      return result;
    });
  }

  private async pruneExpired(now: number): Promise<void> {
    await this.database.query(
      `
        UPDATE ${POSTGRES_STATE_TABLE}
        SET
          session = CASE WHEN retention_expires_at <= $1 THEN NULL ELSE session END,
          retention_expires_at = CASE
            WHEN retention_expires_at <= $1 THEN NULL
            ELSE retention_expires_at
          END,
          receipt = CASE WHEN receipt_expires_at <= $1 THEN NULL ELSE receipt END,
          receipt_expires_at = CASE
            WHEN receipt_expires_at <= $1 THEN NULL
            ELSE receipt_expires_at
          END,
          updated_at = NOW()
        WHERE retention_expires_at <= $1 OR receipt_expires_at <= $1
      `,
      [now],
    );
    await this.database.query(
      `
        DELETE FROM ${POSTGRES_STATE_TABLE}
        WHERE session IS NULL AND orphan IS NULL AND receipt IS NULL
      `,
    );
  }
}

async function loadState(client: PostgresQueryClient, sessionId: string): Promise<PersistentState> {
  const result = await client.query<StateRow>(
    `
      SELECT session, retention_expires_at, orphan, receipt, receipt_expires_at
      FROM ${POSTGRES_STATE_TABLE}
      WHERE session_id = $1
      FOR UPDATE
    `,
    [sessionId],
  );
  const row = result.rows[0];
  if (!row) {
    return {
      session: null,
      retentionExpiresAt: null,
      orphan: null,
      receipt: null,
      receiptExpiresAt: null,
    };
  }
  return {
    session: row.session === null ? null : parseSession(row.session),
    retentionExpiresAt: readNullableNumber(row.retention_expires_at),
    orphan: row.orphan === null ? null : parseOrphan(row.orphan),
    receipt: row.receipt === null ? null : parseReceipt(row.receipt),
    receiptExpiresAt: readNullableNumber(row.receipt_expires_at),
  };
}

async function persistState(
  client: PostgresQueryClient,
  sessionId: string,
  state: PersistentState,
): Promise<void> {
  if (!state.session && !state.orphan && !state.receipt) {
    await client.query(`DELETE FROM ${POSTGRES_STATE_TABLE} WHERE session_id = $1`, [sessionId]);
    return;
  }
  await client.query(
    `
      INSERT INTO ${POSTGRES_STATE_TABLE} (
        session_id,
        session,
        retention_expires_at,
        orphan,
        orphan_due_at,
        receipt,
        receipt_expires_at,
        updated_at
      )
      VALUES ($1, $2::jsonb, $3, $4::jsonb, $5, $6::jsonb, $7, NOW())
      ON CONFLICT (session_id) DO UPDATE SET
        session = EXCLUDED.session,
        retention_expires_at = EXCLUDED.retention_expires_at,
        orphan = EXCLUDED.orphan,
        orphan_due_at = EXCLUDED.orphan_due_at,
        receipt = EXCLUDED.receipt,
        receipt_expires_at = EXCLUDED.receipt_expires_at,
        updated_at = NOW()
    `,
    [
      sessionId,
      state.session ? JSON.stringify(state.session) : null,
      state.retentionExpiresAt,
      state.orphan ? JSON.stringify(state.orphan) : null,
      state.orphan?.dueAt ?? null,
      state.receipt ? JSON.stringify(state.receipt) : null,
      state.receiptExpiresAt,
    ],
  );
}

function pruneState(state: PersistentState, now: number): void {
  if (state.retentionExpiresAt !== null && state.retentionExpiresAt <= now) {
    state.session = null;
    state.retentionExpiresAt = null;
  }
  if (state.receiptExpiresAt !== null && state.receiptExpiresAt <= now) {
    state.receipt = null;
    state.receiptExpiresAt = null;
  }
}

function requireMutableSession(state: PersistentState, now: number): PrintSession {
  const session = state.session;
  if (!session) throw new ServiceError("not_found", "The print session was not found.", 404);
  const processingLeaseActive =
    PROCESSING_STATUSES.has(session.status) && (session.consumeLeaseExpiresAt ?? 0) > now;
  if (session.expiresAt <= now && !processingLeaseActive) {
    throw new ServiceError("expired", "The print session has expired.", 410);
  }
  return structuredClone(session);
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

function parseSession(value: unknown): PrintSession {
  return parsePersisted(() => printSessionSchema.parse(value));
}

function parseOrphan(value: unknown): BlobOrphanRecord {
  const parsed = parsePersisted(() => blobOrphanSchema.parse(value));
  return {
    protocolVersion: parsed.protocolVersion,
    sessionId: parsed.sessionId,
    pathname: parsed.pathname,
    ...(parsed.etag === undefined ? {} : { etag: parsed.etag }),
    createdAt: parsed.createdAt,
    dueAt: parsed.dueAt,
  };
}

function parseReceipt(value: unknown): SessionReceipt {
  return parsePersisted(() => sessionReceiptSchema.parse(value));
}

function parsePersisted<T>(parse: () => T): T {
  try {
    return structuredClone(parse());
  } catch {
    throw corruptState();
  }
}

function readNullableNumber(value: string | number | null): number | null {
  if (value === null) return null;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw corruptState();
  return parsed;
}

function corruptState(): ServiceError {
  return new ServiceError("unavailable", "Persisted session state is invalid.", 503);
}
