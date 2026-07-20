import type { PrintSession, PrintSessionStatus } from "@print-cess/protocol";

export type SessionReceipt = {
  protocolVersion: 1;
  sessionId: string;
  status: "completed" | "failed" | "expired" | "cancelled";
  expiresAt: number;
};

export type BlobOrphanRecord = {
  protocolVersion: 1;
  sessionId: string;
  pathname: string;
  etag?: string;
  createdAt: number;
  dueAt: number;
};

export type UploadAuthorizationResult = {
  session: PrintSession;
  newlyAuthorized: boolean;
};

export type CleanupPreparation =
  | { action: "absent" }
  | { action: "defer"; retryAt: number }
  | {
      action: "delete";
      orphan: BlobOrphanRecord | null;
      receiptStatus: SessionReceipt["status"];
      sealedRevision: number | null;
    };

export interface SessionStore {
  create(session: PrintSession, ttlMs: number): Promise<void>;
  get(sessionId: string): Promise<PrintSession | null>;
  claim(
    sessionId: string,
    uploadTokenHash: string,
    mobileTokenHash: string,
    claimIdHash: string,
    now: number,
    ttlMs: number,
  ): Promise<PrintSession>;
  authorizeUpload(
    sessionId: string,
    mobileTokenHash: string,
    operationIdHash: string,
    blobPath: string,
    now: number,
    cleanupDueAt: number,
  ): Promise<UploadAuthorizationResult>;
  markUploading(sessionId: string, mobileTokenHash: string, now: number): Promise<PrintSession>;
  markUploaded(
    sessionId: string,
    mobileTokenHash: string,
    metadata: { etag: string; size: number },
    now: number,
  ): Promise<PrintSession>;
  consume(
    sessionId: string,
    kioskTokenHash: string,
    consumeIdHash: string,
    now: number,
    leaseMs: number,
  ): Promise<PrintSession>;
  transition(
    sessionId: string,
    kioskTokenHash: string,
    next: PrintSessionStatus,
    now: number,
  ): Promise<PrintSession>;
  cancel(
    sessionId: string,
    candidateTokenHash: string,
    role: "mobile" | "kiosk",
    now: number,
  ): Promise<PrintSession>;
  remove(sessionId: string): Promise<void>;
  putReceipt(receipt: SessionReceipt): Promise<void>;
  getReceipt(sessionId: string): Promise<SessionReceipt | null>;
  prepareCleanup(sessionId: string, now: number): Promise<CleanupPreparation>;
  finalizeCleanup(
    sessionId: string,
    sealedRevision: number | null,
    pathname: string | null,
  ): Promise<boolean>;
  listDueOrphans(now: number, limit: number): Promise<BlobOrphanRecord[]>;
}

export type SignedBlobOperation = {
  method: "PUT" | "GET";
  url: string;
  pathname: string;
  expiresAt: number;
  headers: Record<string, string>;
};

export type BlobMetadata = { etag: string; size: number };

export interface BlobTransport {
  authorizeUpload(
    pathname: string,
    expiresAt: number,
    maximumSize: number,
  ): Promise<SignedBlobOperation>;
  authorizeDownload(pathname: string, expiresAt: number): Promise<SignedBlobOperation>;
  head(pathname: string): Promise<BlobMetadata>;
  delete(pathname: string, etag?: string): Promise<void>;
}

export interface CleanupScheduler {
  schedule(sessionId: string, dueAt: number): Promise<void>;
}
