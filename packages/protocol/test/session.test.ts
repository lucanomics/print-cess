import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  ENVELOPE_OVERHEAD_BYTES,
  ENCRYPTED_BLOB_PATH_PATTERN,
  MAX_ENVELOPE_BYTES,
  DIGEST_PATTERN,
  P256_PUBLIC_KEY_PATTERN,
  PRINT_SESSION_STATUSES,
  SESSION_ID_PATTERN,
  authorizeUploadRequestSchema,
  claimSessionRequestSchema,
  consumeSessionRequestSchema,
  createSessionRequestSchema,
  kioskTransitionRequestSchema,
  printSessionSchema,
  uploadCompleteRequestSchema,
} from "../src/index.js";

const SESSION_ID = "A".repeat(22);
const DIGEST = "A".repeat(43);
const PUBLIC_KEY = `B${"A".repeat(86)}`;

const validSession = {
  protocolVersion: 1,
  sessionId: SESSION_ID,
  status: "waiting",
  kioskPublicKey: PUBLIC_KEY,
  kioskPublicKeyFingerprint: DIGEST,
  createdAt: 1_000,
  expiresAt: 181_000,
  uploadTokenHash: DIGEST,
  kioskTokenHash: DIGEST,
  revision: 0,
} as const;

describe("protocol v1 session schema", () => {
  it("requires the frozen persisted fields without inserting defaults", () => {
    expect(printSessionSchema.parse(validSession)).toEqual(validSession);
    expect(printSessionSchema.safeParse({ ...validSession, revision: undefined }).success).toBe(
      false,
    );
    expect(printSessionSchema.safeParse({ ...validSession, revision: -1 }).success).toBe(false);
    expect(printSessionSchema.safeParse({ ...validSession, revision: 0.5 }).success).toBe(false);
  });

  it("rejects unknown persisted fields instead of stripping them", () => {
    expect(
      printSessionSchema.safeParse({ ...validSession, plaintextFilename: "visitor.pdf" }).success,
    ).toBe(false);
  });

  it("requires expiry to be strictly later than creation", () => {
    expect(printSessionSchema.safeParse({ ...validSession, expiresAt: 1_000 }).success).toBe(false);
    expect(printSessionSchema.safeParse({ ...validSession, expiresAt: 999 }).success).toBe(false);
  });

  it("rejects equal-length non-canonical base64url and compressed/key-prefix variants", () => {
    expect(
      printSessionSchema.safeParse({
        ...validSession,
        sessionId: `${"A".repeat(21)}B`,
      }).success,
    ).toBe(false);
    expect(
      printSessionSchema.safeParse({
        ...validSession,
        kioskPublicKeyFingerprint: `${"A".repeat(42)}B`,
      }).success,
    ).toBe(false);
    expect(
      createSessionRequestSchema.safeParse({
        protocolVersion: 1,
        kioskPublicKey: `A${"A".repeat(86)}`,
        kioskPublicKeyFingerprint: DIGEST,
      }).success,
    ).toBe(false);
    expect(
      printSessionSchema.safeParse({
        ...validSession,
        encryptedBlobPath: `v1/${"A".repeat(21)}B.bin`,
      }).success,
    ).toBe(false);
  });

  it("keeps ciphertext metadata within the binary envelope bounds", () => {
    expect(
      uploadCompleteRequestSchema.safeParse({
        size: ENVELOPE_OVERHEAD_BYTES + 1,
      }).success,
    ).toBe(true);
    expect(uploadCompleteRequestSchema.safeParse({ size: MAX_ENVELOPE_BYTES }).success).toBe(true);

    for (const size of [
      ENVELOPE_OVERHEAD_BYTES,
      MAX_ENVELOPE_BYTES + 1,
      ENVELOPE_OVERHEAD_BYTES + 1.5,
      String(ENVELOPE_OVERHEAD_BYTES + 1),
    ]) {
      expect(uploadCompleteRequestSchema.safeParse({ size }).success).toBe(false);
    }
  });

  it.each([
    [
      "create session",
      createSessionRequestSchema,
      {
        protocolVersion: 1,
        kioskPublicKey: PUBLIC_KEY,
        kioskPublicKeyFingerprint: DIGEST,
      },
    ],
    ["claim", claimSessionRequestSchema, { mobileTokenHash: DIGEST, claimIdHash: DIGEST }],
    ["authorize upload", authorizeUploadRequestSchema, { operationIdHash: DIGEST }],
    ["consume", consumeSessionRequestSchema, { consumeIdHash: DIGEST }],
    ["complete upload", uploadCompleteRequestSchema, { size: ENVELOPE_OVERHEAD_BYTES + 1 }],
    ["kiosk transition", kioskTransitionRequestSchema, { status: "validating" }],
  ] as const)("rejects unknown %s request members", (_name, schema, input) => {
    expect(schema.safeParse({ ...input, unexpected: true }).success).toBe(false);
  });

  it("matches the checked-in JSON Schema status, revision, and size contract", () => {
    const frozen = JSON.parse(
      readFileSync(new URL("../schema/print-session.schema.json", import.meta.url), "utf8"),
    ) as {
      additionalProperties: boolean;
      required: string[];
      properties: {
        sessionId: { pattern: string };
        status: { enum: string[] };
        kioskPublicKey: { pattern: string };
        kioskPublicKeyFingerprint: { $ref: string };
        encryptedBlobPath: { pattern: string };
        encryptedBlobSize: { minimum: number; maximum: number };
        expiresAt: { description: string };
      };
      $defs: { digest: { pattern: string } };
    };

    expect(frozen.additionalProperties).toBe(false);
    expect(frozen.required).toEqual([
      "protocolVersion",
      "sessionId",
      "status",
      "kioskPublicKey",
      "kioskPublicKeyFingerprint",
      "createdAt",
      "expiresAt",
      "uploadTokenHash",
      "kioskTokenHash",
      "revision",
    ]);
    expect(frozen.properties.status.enum).toEqual([...PRINT_SESSION_STATUSES]);
    expect(new RegExp(frozen.properties.sessionId.pattern, "u").source).toBe(
      SESSION_ID_PATTERN.source,
    );
    expect(new RegExp(frozen.properties.kioskPublicKey.pattern, "u").source).toBe(
      P256_PUBLIC_KEY_PATTERN.source,
    );
    expect(frozen.properties.kioskPublicKeyFingerprint.$ref).toBe("#/$defs/digest");
    expect(new RegExp(frozen.properties.encryptedBlobPath.pattern, "u").source).toBe(
      ENCRYPTED_BLOB_PATH_PATTERN.source,
    );
    expect(new RegExp(frozen.$defs.digest.pattern, "u").source).toBe(DIGEST_PATTERN.source);
    expect(frozen.properties.expiresAt.description).toContain("strictly greater than createdAt");
    expect(frozen.properties.encryptedBlobSize).toMatchObject({
      minimum: ENVELOPE_OVERHEAD_BYTES + 1,
      maximum: MAX_ENVELOPE_BYTES,
    });
  });
});
