import { beforeAll, describe, expect, it } from "vitest";

import { DROP_CODE_PATTERN, DROP_ID_PATTERN } from "@print-cess/protocol";

import {
  decryptDropChunk,
  decryptDropManifest,
  deriveDropFileKey,
  deriveDropKeys,
  dropChunkCount,
  dropPartIndex,
  dropTotalPartCount,
  encryptDropChunk,
  encryptDropManifest,
  generateDropCode,
  type DropKeys,
  type DropManifest,
} from "../src/drop-crypto.js";

// Key stretching is deliberately expensive, so the suite derives once and
// reuses the result rather than paying for it in every assertion.
const CODE = "23456789ABCD";
const OTHER_CODE = "ZYXWVTSRQPNM";
let keys: DropKeys;
let otherKeys: DropKeys;
let fileKey: CryptoKey;

const manifest: DropManifest = {
  protocolVersion: 1,
  files: [
    { name: "holiday.jpg", size: 12, type: "image/jpeg", chunkCount: 1 },
    { name: "notes.pdf", size: 40, type: "application/pdf", chunkCount: 1 },
  ],
};

const CONTEXT = { fileIndex: 0, chunkIndex: 0, chunkCount: 1, partIndex: 0 };

beforeAll(async () => {
  [keys, otherKeys] = await Promise.all([deriveDropKeys(CODE), deriveDropKeys(OTHER_CODE)]);
  fileKey = await deriveDropFileKey(keys, 0);
}, 30_000);

describe("code derivation", () => {
  it("generates codes that match the wire format", () => {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      expect(DROP_CODE_PATTERN.test(generateDropCode())).toBe(true);
    }
  });

  it("derives the same identifier from the same code, whatever its spacing", async () => {
    const spaced = await deriveDropKeys("2345-6789-abcd");
    expect(spaced.dropId).toBe(keys.dropId);
    expect(DROP_ID_PATTERN.test(keys.dropId)).toBe(true);
  });

  it("gives different codes different identifiers", () => {
    expect(otherKeys.dropId).not.toBe(keys.dropId);
  });

  it("refuses a code that is not twelve characters", async () => {
    await expect(deriveDropKeys("2345-6789")).rejects.toThrow(/twelve/u);
  });
});

describe("chunk encryption", () => {
  it("round-trips a chunk", async () => {
    const plaintext = new Uint8Array([1, 2, 3, 4, 5]);
    const sealed = await encryptDropChunk(fileKey, keys, CONTEXT, plaintext);
    expect(sealed.byteLength).toBe(plaintext.byteLength + 16);
    await expect(decryptDropChunk(fileKey, keys, CONTEXT, sealed)).resolves.toEqual(plaintext);
  });

  it("refuses a chunk that claims a different position in the file", async () => {
    const sealed = await encryptDropChunk(
      fileKey,
      keys,
      { fileIndex: 0, chunkIndex: 0, chunkCount: 3, partIndex: 0 },
      new Uint8Array([9, 9, 9]),
    );
    // A reordered or replayed chunk must fail authentication, not decrypt into
    // a plausible-looking but wrong file.
    await expect(
      decryptDropChunk(
        fileKey,
        keys,
        { fileIndex: 0, chunkIndex: 1, chunkCount: 3, partIndex: 1 },
        sealed,
      ),
    ).rejects.toThrow();
  });

  it("refuses a chunk that claims a shorter file than it was sealed for", async () => {
    const sealed = await encryptDropChunk(
      fileKey,
      keys,
      { fileIndex: 0, chunkIndex: 0, chunkCount: 4, partIndex: 0 },
      new Uint8Array([7]),
    );
    await expect(
      decryptDropChunk(
        fileKey,
        keys,
        { fileIndex: 0, chunkIndex: 0, chunkCount: 2, partIndex: 0 },
        sealed,
      ),
    ).rejects.toThrow();
  });

  it("refuses a chunk moved into another file of the same transfer", async () => {
    const sealed = await encryptDropChunk(fileKey, keys, CONTEXT, new Uint8Array([4, 2]));
    const secondFileKey = await deriveDropFileKey(keys, 1);
    await expect(
      decryptDropChunk(
        secondFileKey,
        keys,
        { fileIndex: 1, chunkIndex: 0, chunkCount: 1, partIndex: 1 },
        sealed,
      ),
    ).rejects.toThrow();
  });

  it("gives each file its own key", async () => {
    const first = await deriveDropFileKey(keys, 0);
    const second = await deriveDropFileKey(keys, 1);
    const sealed = await encryptDropChunk(first, keys, CONTEXT, new Uint8Array([1]));
    await expect(decryptDropChunk(second, keys, CONTEXT, sealed)).rejects.toThrow();
  });

  it("rejects an empty chunk", async () => {
    await expect(encryptDropChunk(fileKey, keys, CONTEXT, new Uint8Array())).rejects.toThrow();
  });
});

describe("manifest encryption", () => {
  it("round-trips the file list", async () => {
    const sealed = await encryptDropManifest(keys, manifest);
    await expect(decryptDropManifest(keys, sealed, 2)).resolves.toEqual(manifest);
  });

  it("stays closed to a different transfer code", async () => {
    const sealed = await encryptDropManifest(keys, manifest);
    await expect(decryptDropManifest(otherKeys, sealed, 2)).rejects.toThrow();
  });

  it("refuses a file count the server disagrees with", async () => {
    const sealed = await encryptDropManifest(keys, manifest);
    await expect(decryptDropManifest(keys, sealed, 3)).rejects.toThrow();
  });

  it("refuses a file list whose chunk count contradicts its size", async () => {
    await expect(
      encryptDropManifest(keys, {
        protocolVersion: 1,
        files: [{ name: "a.bin", size: 12, type: "", chunkCount: 4 }],
      }),
    ).rejects.toThrow();
  });

  it("refuses an empty file", async () => {
    await expect(
      encryptDropManifest(keys, {
        protocolVersion: 1,
        files: [{ name: "a.bin", size: 0, type: "", chunkCount: 1 }],
      }),
    ).rejects.toThrow();
  });
});

describe("part layout", () => {
  it("lays files out end to end so both sides agree on storage order", () => {
    const files = [{ chunkCount: 3 }, { chunkCount: 1 }, { chunkCount: 2 }];
    expect(dropPartIndex(files, 0, 0)).toBe(0);
    expect(dropPartIndex(files, 1, 0)).toBe(3);
    expect(dropPartIndex(files, 2, 1)).toBe(5);
    expect(dropTotalPartCount(files)).toBe(6);
  });

  it("counts a partial trailing chunk", () => {
    expect(dropChunkCount(1)).toBe(1);
    expect(dropChunkCount(8 * 1024 * 1024)).toBe(1);
    expect(dropChunkCount(8 * 1024 * 1024 + 1)).toBe(2);
  });
});
