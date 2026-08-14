import { describe, expect, it } from "vitest";

import {
  DROP_CHUNK_BYTES,
  DROP_CODE_ALPHABET,
  DROP_CODE_LENGTH,
  DROP_CODE_PATTERN,
  DROP_BLOB_PATH_PATTERN,
  MAX_DROP_PARTS,
  createDropRequestSchema,
  dropPartPath,
  dropRecordSchema,
  formatDropCode,
  normalizeDropCode,
} from "../src/drop.js";

const DROP_ID = "A".repeat(21) + "A";
const DIGEST = "A".repeat(43);

function record(overrides: Record<string, unknown> = {}) {
  return {
    protocolVersion: 1,
    dropId: DROP_ID,
    status: "collecting",
    ownerTokenHash: DIGEST,
    manifest: "abcDEF123_-",
    fileCount: 1,
    partCount: 2,
    parts: [null, null],
    totalCiphertextBytes: 0,
    downloadCount: 0,
    createdAt: 1_000,
    expiresAt: 1_801_000,
    revision: 0,
    ...overrides,
  };
}

describe("transfer codes", () => {
  it("uses a 32-symbol alphabet with no look-alike letters", () => {
    expect(DROP_CODE_ALPHABET).toHaveLength(32);
    expect(new Set(DROP_CODE_ALPHABET).size).toBe(32);
    for (const letter of ["I", "L", "O", "U"]) {
      expect(DROP_CODE_ALPHABET).not.toContain(letter);
    }
  });

  it("groups a code into readable blocks without changing it", () => {
    expect(formatDropCode("23456789ABCD")).toBe("2345-6789-ABCD");
    expect(normalizeDropCode(formatDropCode("23456789ABCD"))).toBe("23456789ABCD");
  });

  it("folds the letters a reader substitutes onto the symbols they resemble", () => {
    // Someone copying a code off another screen may type O for 0 and l or I for 1.
    expect(normalizeDropCode("aOcd efgh jk lI")).toBe("A0CDEFGHJK11");
    expect(normalizeDropCode("ou")).toBe("0V");
  });

  it("accepts only a complete twelve-character code", () => {
    expect(DROP_CODE_PATTERN.test("23456789ABCD")).toBe(true);
    expect(DROP_CODE_PATTERN.test("23456789ABC")).toBe(false);
    expect(DROP_CODE_PATTERN.test("23456789ABCDE")).toBe(false);
    expect(DROP_CODE_PATTERN.test("23456789ABCI")).toBe(false);
    expect(DROP_CODE_LENGTH).toBe(12);
  });
});

describe("part paths", () => {
  it("derives a canonical path from the identifier and index", () => {
    const path = dropPartPath(DROP_ID, 0);
    expect(path).toBe(`d1/${DROP_ID}/p0.bin`);
    expect(DROP_BLOB_PATH_PATTERN.test(path)).toBe(true);
    expect(DROP_BLOB_PATH_PATTERN.test(dropPartPath(DROP_ID, MAX_DROP_PARTS - 1))).toBe(true);
  });

  it("refuses an index outside the transfer and a malformed identifier", () => {
    expect(() => dropPartPath(DROP_ID, -1)).toThrow();
    expect(() => dropPartPath(DROP_ID, MAX_DROP_PARTS)).toThrow();
    expect(() => dropPartPath("../etc", 0)).toThrow();
  });

  it("rejects a path that tries to escape the transfer's own prefix", () => {
    expect(DROP_BLOB_PATH_PATTERN.test(`d1/${DROP_ID}/../p0.bin`)).toBe(false);
    expect(DROP_BLOB_PATH_PATTERN.test(`v1/${DROP_ID}.bin`)).toBe(false);
  });
});

describe("drop record schema", () => {
  it("accepts a freshly created record", () => {
    expect(dropRecordSchema.parse(record())).toMatchObject({ status: "collecting" });
  });

  it("requires the part table to match the declared part count", () => {
    expect(dropRecordSchema.safeParse(record({ parts: [null] })).success).toBe(false);
  });

  it("refuses an unknown member so stored state cannot smuggle extra fields", () => {
    expect(dropRecordSchema.safeParse(record({ plaintextName: "passport.pdf" })).success).toBe(
      false,
    );
  });

  it("refuses a part larger than one chunk plus its authentication tag", () => {
    const oversize = record({ parts: [{ size: DROP_CHUNK_BYTES + 17 }, null] });
    expect(dropRecordSchema.safeParse(oversize).success).toBe(false);
  });

  it("refuses an expiry that is not after creation", () => {
    expect(dropRecordSchema.safeParse(record({ expiresAt: 1_000 })).success).toBe(false);
  });
});

describe("create request", () => {
  it("accepts a well-formed request", () => {
    const parsed = createDropRequestSchema.safeParse({
      protocolVersion: 1,
      dropId: DROP_ID,
      ownerTokenHash: DIGEST,
      manifest: "abc-_123",
      fileCount: 2,
      partCount: 3,
    });
    expect(parsed.success).toBe(true);
  });

  it("refuses a manifest that is not base64url", () => {
    const parsed = createDropRequestSchema.safeParse({
      protocolVersion: 1,
      dropId: DROP_ID,
      ownerTokenHash: DIGEST,
      manifest: "not base64!",
      fileCount: 1,
      partCount: 1,
    });
    expect(parsed.success).toBe(false);
  });
});
