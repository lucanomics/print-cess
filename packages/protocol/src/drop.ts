import { z } from "zod";

import { DIGEST_PATTERN } from "./canonical.js";

/**
 * A "drop" is a short-lived, end-to-end encrypted hand-off of one or more files
 * between two phones. It shares nothing with the print session state machine:
 * there is no kiosk, no printer, and no single-document restriction.
 *
 * The only secret is a twelve-character transfer code that the sender's browser
 * generates and never sends anywhere. Both the storage identifier and the
 * content key are stretched out of that code on the device, so the server holds
 * ciphertext plus an opaque identifier and can never read a file it stores.
 */
export const DROP_PROTOCOL_VERSION = 1 as const;

/**
 * Crockford base32. The letters people mistype when they read a code off
 * someone else's screen — I, L, O, U — are absent from the alphabet and folded
 * onto the digit they look like by `normalizeDropCode`, so a misread still
 * resolves to the code the sender is showing.
 */
export const DROP_CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ" as const;
export const DROP_CODE_LENGTH = 12;
export const DROP_CODE_GROUP_SIZE = 4;
export const DROP_CODE_PATTERN = /^[0-9A-HJKMNP-TV-Z]{12}$/u;
/** Twelve characters of a 32-symbol alphabet: sixty bits of transfer secret. */
export const DROP_CODE_ENTROPY_BITS = DROP_CODE_LENGTH * 5;

/** Same 16-byte canonical base64url shape as a print session identifier. */
export const DROP_ID_PATTERN = /^[A-Za-z0-9_-]{21}[AQgw]$/u;
export const DROP_BLOB_PATH_PATTERN = /^d1\/[A-Za-z0-9_-]{21}[AQgw]\/p[0-9]{1,4}\.bin$/u;

/**
 * Plaintext bytes per encrypted part. Small enough that one part still finishes
 * inside a signed-URL lifetime on a weak mobile connection, and large enough
 * that a multi-gigabyte transfer stays well under the part ceiling.
 */
export const DROP_CHUNK_BYTES = 8 * 1024 * 1024;
export const DROP_PART_TAG_BYTES = 16;
export const MAX_DROP_PART_BYTES = DROP_CHUNK_BYTES + DROP_PART_TAG_BYTES;
export const MAX_DROP_PARTS = 4096;
export const MAX_DROP_FILES = 20;
export const MAX_DROP_TOTAL_BYTES = MAX_DROP_PARTS * DROP_CHUNK_BYTES;
/** Encrypted file list, base64url, stored beside the record rather than as a blob. */
export const MAX_DROP_MANIFEST_BYTES = 16 * 1024;
export const MAX_DROP_FILE_NAME_LENGTH = 180;

export const DROP_HKDF_INFO = "print-cess-by-paradiso:drop:v1";
export const DROP_CODE_KDF_SALT = "print-cess-by-paradiso:drop-code:v1";
/**
 * The transfer code carries about sixty bits. Stretching it lifts the cost of
 * an offline attack on leaked ciphertext by roughly nineteen bits, while still
 * finishing in a few hundred milliseconds on a mid-range phone.
 */
export const DROP_CODE_KDF_ITERATIONS = 310_000;

export const DROP_STATUSES = ["collecting", "ready"] as const;
export type DropStatus = (typeof DROP_STATUSES)[number];

export function dropPartPath(dropId: string, partIndex: number): string {
  if (!DROP_ID_PATTERN.test(dropId)) throw new Error("Invalid drop identifier");
  if (!Number.isInteger(partIndex) || partIndex < 0 || partIndex >= MAX_DROP_PARTS) {
    throw new Error("Invalid drop part index");
  }
  return `d1/${dropId}/p${partIndex}.bin`;
}

export function formatDropCode(code: string): string {
  const groups: string[] = [];
  for (let index = 0; index < code.length; index += DROP_CODE_GROUP_SIZE) {
    groups.push(code.slice(index, index + DROP_CODE_GROUP_SIZE));
  }
  return groups.join("-");
}

/**
 * Accepts what a person actually types: lower case, spaces, hyphens, and the
 * four look-alike letters the alphabet leaves out.
 */
export function normalizeDropCode(input: string): string {
  return input
    .toUpperCase()
    .replace(/[^0-9A-Z]/gu, "")
    .replaceAll("O", "0")
    .replaceAll("I", "1")
    .replaceAll("L", "1")
    .replaceAll("U", "V");
}

const partSchema = z
  .object({
    size: z.number().int().min(1).max(MAX_DROP_PART_BYTES),
    etag: z.string().min(1).max(256).optional(),
  })
  .strict();

export const dropRecordSchema = z
  .object({
    protocolVersion: z.literal(DROP_PROTOCOL_VERSION),
    dropId: z.string().regex(DROP_ID_PATTERN),
    status: z.enum(DROP_STATUSES),
    ownerTokenHash: z.string().regex(DIGEST_PATTERN),
    manifest: z
      .string()
      .regex(/^[A-Za-z0-9_-]+$/u)
      .max(MAX_DROP_MANIFEST_BYTES),
    fileCount: z.number().int().min(1).max(MAX_DROP_FILES),
    partCount: z.number().int().min(1).max(MAX_DROP_PARTS),
    /** Index-aligned with the part list; `null` until that part is committed. */
    parts: z.array(partSchema.nullable()).min(1).max(MAX_DROP_PARTS),
    totalCiphertextBytes: z.number().int().min(0),
    downloadCount: z.number().int().nonnegative(),
    createdAt: z.number().int().nonnegative(),
    expiresAt: z.number().int().positive(),
    revision: z.number().int().nonnegative(),
  })
  .strict()
  .refine((drop) => drop.parts.length === drop.partCount, {
    message: "The part table must match the declared part count.",
    path: ["parts"],
  })
  .refine((drop) => drop.expiresAt > drop.createdAt, {
    message: "Drop expiry must be later than creation.",
    path: ["expiresAt"],
  });

export type DropRecord = z.infer<typeof dropRecordSchema>;

export const createDropRequestSchema = z
  .object({
    protocolVersion: z.literal(DROP_PROTOCOL_VERSION),
    dropId: z.string().regex(DROP_ID_PATTERN),
    ownerTokenHash: z.string().regex(DIGEST_PATTERN),
    manifest: z
      .string()
      .regex(/^[A-Za-z0-9_-]+$/u)
      .max(MAX_DROP_MANIFEST_BYTES),
    fileCount: z.number().int().min(1).max(MAX_DROP_FILES),
    partCount: z.number().int().min(1).max(MAX_DROP_PARTS),
  })
  .strict();

export const dropPartAuthorizeRequestSchema = z
  .object({
    indexes: z
      .array(
        z
          .number()
          .int()
          .min(0)
          .max(MAX_DROP_PARTS - 1),
      )
      .min(1)
      .max(8),
  })
  .strict();

export const dropPartCommitRequestSchema = z
  .object({
    parts: z
      .array(
        z
          .object({
            index: z
              .number()
              .int()
              .min(0)
              .max(MAX_DROP_PARTS - 1),
            size: z.number().int().min(1).max(MAX_DROP_PART_BYTES),
          })
          .strict(),
      )
      .min(1)
      .max(8),
  })
  .strict();

export const dropDownloadRequestSchema = z
  .object({
    indexes: z
      .array(
        z
          .number()
          .int()
          .min(0)
          .max(MAX_DROP_PARTS - 1),
      )
      .min(1)
      .max(8),
  })
  .strict();

/**
 * What the receiving phone learns before it can decrypt anything: how many
 * parts exist and how big each one is. File names live inside `manifest`,
 * which only the transfer code can open.
 */
export type DropOpenView = {
  protocolVersion: typeof DROP_PROTOCOL_VERSION;
  dropId: string;
  manifest: string;
  fileCount: number;
  partCount: number;
  partSizes: number[];
  totalCiphertextBytes: number;
  expiresAt: number;
};

export type DropSenderView = {
  protocolVersion: typeof DROP_PROTOCOL_VERSION;
  dropId: string;
  status: DropStatus;
  uploadedPartCount: number;
  partCount: number;
  downloadCount: number;
  expiresAt: number;
};
