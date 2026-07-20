import { z } from "zod";

import {
  DIGEST_PATTERN,
  ENCRYPTED_BLOB_PATH_PATTERN,
  P256_PUBLIC_KEY_PATTERN,
  SESSION_ID_PATTERN,
} from "./canonical.js";
import { ENVELOPE_OVERHEAD_BYTES, MAX_ENVELOPE_BYTES } from "./envelope.js";
import { PRINT_SESSION_STATUSES } from "./status.js";

export const PROTOCOL_VERSION = 1 as const;
export const SESSION_TTL_MS = 3 * 60 * 1000;
export const COMPLETION_SCREEN_MS = 15 * 1000;

export const printSessionSchema = z
  .object({
    protocolVersion: z.literal(PROTOCOL_VERSION),
    sessionId: z.string().regex(SESSION_ID_PATTERN),
    status: z.enum(PRINT_SESSION_STATUSES),
    kioskPublicKey: z.string().regex(P256_PUBLIC_KEY_PATTERN),
    kioskPublicKeyFingerprint: z.string().regex(DIGEST_PATTERN),
    encryptedBlobPath: z.string().regex(ENCRYPTED_BLOB_PATH_PATTERN).optional(),
    encryptedBlobEtag: z.string().min(1).max(256).optional(),
    encryptedBlobSize: z
      .number()
      .int()
      .min(ENVELOPE_OVERHEAD_BYTES + 1)
      .max(MAX_ENVELOPE_BYTES)
      .optional(),
    createdAt: z.number().int().nonnegative(),
    expiresAt: z.number().int().positive(),
    uploadTokenHash: z.string().regex(DIGEST_PATTERN),
    kioskTokenHash: z.string().regex(DIGEST_PATTERN),
    mobileTokenHash: z.string().regex(DIGEST_PATTERN).optional(),
    claimIdHash: z.string().regex(DIGEST_PATTERN).optional(),
    uploadOperationIdHash: z.string().regex(DIGEST_PATTERN).optional(),
    consumeIdHash: z.string().regex(DIGEST_PATTERN).optional(),
    consumeLeaseExpiresAt: z.number().int().positive().optional(),
    claimedAt: z.number().int().nonnegative().optional(),
    completedAt: z.number().int().nonnegative().optional(),
    revision: z.number().int().nonnegative(),
  })
  .strict()
  .refine((session) => session.expiresAt > session.createdAt, {
    message: "Session expiry must be later than creation.",
    path: ["expiresAt"],
  });

export type PrintSession = z.infer<typeof printSessionSchema>;

export const createSessionRequestSchema = z
  .object({
    protocolVersion: z.literal(PROTOCOL_VERSION),
    kioskPublicKey: z.string().regex(P256_PUBLIC_KEY_PATTERN),
    kioskPublicKeyFingerprint: z.string().regex(DIGEST_PATTERN),
  })
  .strict();

export const uploadCompleteRequestSchema = z
  .object({
    etag: z.string().min(1).max(256),
    size: z
      .number()
      .int()
      .min(ENVELOPE_OVERHEAD_BYTES + 1)
      .max(MAX_ENVELOPE_BYTES),
  })
  .strict();

export const claimSessionRequestSchema = z
  .object({
    mobileTokenHash: z.string().regex(DIGEST_PATTERN),
    claimIdHash: z.string().regex(DIGEST_PATTERN),
  })
  .strict();

export const authorizeUploadRequestSchema = z
  .object({
    operationIdHash: z.string().regex(DIGEST_PATTERN),
  })
  .strict();

export const consumeSessionRequestSchema = z
  .object({
    consumeIdHash: z.string().regex(DIGEST_PATTERN),
  })
  .strict();

export const kioskTransitionRequestSchema = z
  .object({
    status: z.enum(["validating", "printing", "completed", "failed"]),
  })
  .strict();

export type PublicSessionView = Pick<
  PrintSession,
  "protocolVersion" | "sessionId" | "status" | "expiresAt"
>;
