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
  requiredPartCountCeiling,
  requiredPartCountFloor,
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
    totalBytes: 80,
    parts: [null, null],
    totalCiphertextBytes: 0,
    openCount: 0,
    downloadCount: 0,
    deliveredCount: 0,
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

  it("accepts a tag-only part, which is what an empty file weighs", () => {
    expect(dropRecordSchema.safeParse(record({ parts: [{ size: 16 }, null] })).success).toBe(true);
    // Below one tag there is no authenticated part at all.
    expect(dropRecordSchema.safeParse(record({ parts: [{ size: 15 }, null] })).success).toBe(false);
  });

  it("fills in the receiver counters a record written by an earlier build lacks", () => {
    const legacy = record();
    delete (legacy as Record<string, unknown>).openCount;
    delete (legacy as Record<string, unknown>).deliveredCount;
    delete (legacy as Record<string, unknown>).totalBytes;
    expect(dropRecordSchema.parse(legacy)).toMatchObject({
      openCount: 0,
      deliveredCount: 0,
      totalBytes: 0,
    });
  });

  it("refuses an expiry that is not after creation", () => {
    expect(dropRecordSchema.safeParse(record({ expiresAt: 1_000 })).success).toBe(false);
  });
});

describe("create request", () => {
  function createRequest(overrides: Record<string, unknown> = {}) {
    return {
      protocolVersion: 1,
      dropId: DROP_ID,
      ownerTokenHash: DIGEST,
      manifest: "abc-_123",
      fileCount: 2,
      partCount: 3,
      totalBytes: DROP_CHUNK_BYTES + 10,
      ...overrides,
    };
  }

  it("accepts a well-formed request", () => {
    expect(createDropRequestSchema.safeParse(createRequest()).success).toBe(true);
  });

  it("refuses a manifest that is not base64url", () => {
    const parsed = createDropRequestSchema.safeParse(
      createRequest({ manifest: "not base64!", fileCount: 1, partCount: 1, totalBytes: 4 }),
    );
    expect(parsed.success).toBe(false);
  });

  it("accepts many tiny files, which cost one part each", () => {
    // Twenty one-kilobyte files are twenty parts and twenty kilobytes. A part
    // ceiling derived from a byte ceiling used to refuse exactly this.
    const parsed = createDropRequestSchema.safeParse(
      createRequest({ fileCount: 20, partCount: 20, totalBytes: 20 * 1024 }),
    );
    expect(parsed.success).toBe(true);
  });

  it("accepts a file that is exactly one chunk", () => {
    const parsed = createDropRequestSchema.safeParse(
      createRequest({ fileCount: 1, partCount: 1, totalBytes: DROP_CHUNK_BYTES }),
    );
    expect(parsed.success).toBe(true);
  });

  it("accepts an empty file, which still costs one part", () => {
    const parsed = createDropRequestSchema.safeParse(
      createRequest({ fileCount: 1, partCount: 1, totalBytes: 0 }),
    );
    expect(parsed.success).toBe(true);
  });

  it("refuses a part count too small for the size it declares", () => {
    const parsed = createDropRequestSchema.safeParse(
      createRequest({ fileCount: 1, partCount: 1, totalBytes: DROP_CHUNK_BYTES * 4 }),
    );
    expect(parsed.success).toBe(false);
  });

  it("refuses reserving thousands of parts for a transfer declared as tiny", () => {
    // Otherwise a client could hold four thousand storage slots open by
    // claiming to be sending a single byte.
    const parsed = createDropRequestSchema.safeParse(
      createRequest({ fileCount: 1, partCount: 4096, totalBytes: 1 }),
    );
    expect(parsed.success).toBe(false);
  });
});

describe("part-count bounds", () => {
  it("agrees with what the chunk arithmetic actually produces", () => {
    for (const sizes of [
      [0],
      [1],
      [DROP_CHUNK_BYTES],
      [DROP_CHUNK_BYTES + 1],
      [DROP_CHUNK_BYTES * 3],
      [1, 1, 1, 1, 1],
      [0, DROP_CHUNK_BYTES, 5],
      [DROP_CHUNK_BYTES * 2 + 1, 7, DROP_CHUNK_BYTES],
    ]) {
      const totalBytes = sizes.reduce((total, size) => total + size, 0);
      const partCount = sizes.reduce(
        (total, size) => total + Math.max(1, Math.ceil(size / DROP_CHUNK_BYTES)),
        0,
      );
      expect(partCount).toBeGreaterThanOrEqual(requiredPartCountFloor(sizes.length, totalBytes));
      expect(partCount).toBeLessThanOrEqual(requiredPartCountCeiling(sizes.length, totalBytes));
    }
  });
});
