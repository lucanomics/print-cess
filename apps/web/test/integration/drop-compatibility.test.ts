import { createHash } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return {
    ...actual,
    after: (callback: () => void | Promise<void>) => {
      void callback();
    },
  };
});

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
  generateToken,
  hashToken,
  type DropKeys,
  type DropManifest,
  type DropManifestFile,
} from "@print-cess/crypto";
import { DROP_CHUNK_BYTES, type DropOpenView } from "@print-cess/protocol";
import { ALL_SAMPLE_GROUPS, type SyntheticFile } from "@print-cess/test-fixtures";

import { POST as createDropRoute } from "@/app/api/drops/route";
import { POST as authorizePartsRoute } from "@/app/api/drops/[dropId]/parts/route";
import { POST as commitPartsRoute } from "@/app/api/drops/[dropId]/parts/complete/route";
import { POST as sealDropRoute } from "@/app/api/drops/[dropId]/seal/route";
import { POST as openDropRoute } from "@/app/api/drops/[dropId]/open/route";
import { POST as downloadRoute } from "@/app/api/drops/[dropId]/download/route";
import { GET as blobGetRoute, PUT as blobPutRoute } from "@/app/api/dev/blob/route";
import { safeFileName, safeMediaType } from "@/lib/drop-file-name";

/**
 * The compatibility matrix, driven through the real API routes, the real
 * signed-URL transport, and the real chunk encryption — not through a mock of
 * any of them.
 *
 * The claim under test is the one the whole hand-off rests on: an arbitrary
 * file goes in one side and comes out the other byte for byte, with its name
 * and its declared type intact, and the service never has to know what it was
 * carrying. A test that asserted anything less than a digest comparison would
 * be assuming that claim rather than checking it.
 */

const ORIGIN = "http://localhost:3000";

type Operation = { index: number; url: string; headers: Record<string, string> };

/**
 * Each transfer in this suite comes from its own address, because in the
 * product each one comes from its own phone. Sharing one would run the whole
 * matrix into the per-caller creation limit, which is a real protection and
 * should not be relaxed to make a test pass.
 */
let sender = 0;
function nextSender(): string {
  sender += 1;
  return `198.51.100.${sender % 250}`;
}

function jsonRequest(
  path: string,
  body: unknown,
  headers: Record<string, string> = {},
  address = "198.51.100.1",
): Request {
  return new Request(`${ORIGIN}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: ORIGIN,
      "x-forwarded-for": address,
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

function params(dropId: string) {
  return { params: Promise.resolve({ dropId }) };
}

function digest(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** What the sending phone would put in the manifest for a chosen file. */
function manifestEntry(file: SyntheticFile): DropManifestFile {
  return {
    name: safeFileName(file.name),
    size: file.bytes.byteLength,
    type: safeMediaType(file.mediaType),
    chunkCount: dropChunkCount(file.bytes.byteLength),
  };
}

/** Everything the sending phone does, in the order it does it. */
async function send(
  keys: DropKeys,
  files: readonly SyntheticFile[],
  address = nextSender(),
): Promise<{ ownerToken: string }> {
  const manifestFiles = files.map(manifestEntry);
  const manifest: DropManifest = { protocolVersion: 1, files: manifestFiles };
  const ownerToken = generateToken(32);
  const totalBytes = files.reduce((total, file) => total + file.bytes.byteLength, 0);

  const created = await createDropRoute(
    jsonRequest(
      "/api/drops",
      {
        protocolVersion: 1,
        dropId: keys.dropId,
        ownerTokenHash: await hashToken(ownerToken, "drop"),
        manifest: await encryptDropManifest(keys, manifest),
        fileCount: files.length,
        partCount: dropTotalPartCount(manifestFiles),
        totalBytes,
      },
      {},
      address,
    ),
  );
  expect(created.status).toBe(201);

  for (const [fileIndex, file] of files.entries()) {
    const entry = manifestFiles[fileIndex]!;
    const fileKey = await deriveDropFileKey(keys, fileIndex);
    for (let chunkIndex = 0; chunkIndex < entry.chunkCount; chunkIndex += 1) {
      const partIndex = dropPartIndex(manifestFiles, fileIndex, chunkIndex);
      const offset = chunkIndex * DROP_CHUNK_BYTES;
      const plaintext = file.bytes.subarray(
        offset,
        Math.min(offset + DROP_CHUNK_BYTES, file.bytes.byteLength),
      );
      const ciphertext = await encryptDropChunk(
        fileKey,
        keys,
        { fileIndex, chunkIndex, chunkCount: entry.chunkCount, partIndex },
        plaintext,
      );

      const authorized = await authorizePartsRoute(
        jsonRequest(
          `/api/drops/${keys.dropId}/parts`,
          { indexes: [partIndex] },
          { "x-print-cess-drop-token": ownerToken },
        ),
        params(keys.dropId),
      );
      expect(authorized.status).toBe(200);
      const { operations } = (await authorized.json()) as { operations: Operation[] };
      const operation = operations[0]!;

      const put = await blobPutRoute(
        new Request(operation.url, {
          method: "PUT",
          headers: { ...operation.headers, "Content-Length": String(ciphertext.byteLength) },
          body: ciphertext.slice().buffer,
        }),
      );
      expect(put.status).toBe(201);

      const committed = await commitPartsRoute(
        jsonRequest(
          `/api/drops/${keys.dropId}/parts/complete`,
          { parts: [{ index: partIndex, size: ciphertext.byteLength }] },
          { "x-print-cess-drop-token": ownerToken },
        ),
        params(keys.dropId),
      );
      expect(committed.status).toBe(200);
    }
  }

  const sealed = await sealDropRoute(
    jsonRequest(`/api/drops/${keys.dropId}/seal`, {}, { "x-print-cess-drop-token": ownerToken }),
    params(keys.dropId),
  );
  expect(sealed.status).toBe(200);
  return { ownerToken };
}

/** Everything the receiving phone does, ending in reassembled plaintext. */
async function receive(keys: DropKeys): Promise<{ manifest: DropManifest; files: Uint8Array[] }> {
  const opened = await openDropRoute(
    jsonRequest(`/api/drops/${keys.dropId}/open`, {}),
    params(keys.dropId),
  );
  expect(opened.status).toBe(200);
  const view = (await opened.json()) as DropOpenView;
  const manifest = await decryptDropManifest(keys, view.manifest, view.fileCount);

  const files: Uint8Array[] = [];
  for (const [fileIndex, entry] of manifest.files.entries()) {
    const fileKey = await deriveDropFileKey(keys, fileIndex);
    const assembled: Uint8Array[] = [];
    for (let chunkIndex = 0; chunkIndex < entry.chunkCount; chunkIndex += 1) {
      const partIndex = dropPartIndex(manifest.files, fileIndex, chunkIndex);
      const authorized = await downloadRoute(
        jsonRequest(`/api/drops/${keys.dropId}/download`, { indexes: [partIndex] }),
        params(keys.dropId),
      );
      expect(authorized.status).toBe(200);
      const { operations } = (await authorized.json()) as { operations: Operation[] };
      const response = await blobGetRoute(new Request(operations[0]!.url, { method: "GET" }));
      expect(response.status).toBe(200);
      const ciphertext = new Uint8Array(await response.arrayBuffer());
      assembled.push(
        await decryptDropChunk(
          fileKey,
          keys,
          { fileIndex, chunkIndex, chunkCount: entry.chunkCount, partIndex },
          ciphertext,
        ),
      );
    }
    const total = assembled.reduce((sum, chunk) => sum + chunk.byteLength, 0);
    const whole = new Uint8Array(total);
    let offset = 0;
    for (const chunk of assembled) {
      whole.set(chunk, offset);
      offset += chunk.byteLength;
    }
    files.push(whole);
  }
  return { manifest, files };
}

async function roundTrip(files: readonly SyntheticFile[]) {
  const keys = await deriveDropKeys(generateDropCode());
  await send(keys, files);
  return receive(keys);
}

beforeEach(() => {
  vi.stubEnv("PRINT_CESS_ADAPTER_MODE", "local");
  vi.stubEnv("PUBLIC_BASE_URL", ORIGIN);
  vi.stubEnv("ALLOWED_ORIGINS", ORIGIN);
  globalThis.__printCessRuntime = undefined;
});

afterEach(() => {
  vi.unstubAllEnvs();
  globalThis.__printCessRuntime = undefined;
});

describe("file compatibility", () => {
  for (const { group, files } of ALL_SAMPLE_GROUPS) {
    it(`carries ${group} through unchanged, byte for byte`, async () => {
      const received = await roundTrip(files);

      expect(received.files).toHaveLength(files.length);
      for (const [index, original] of files.entries()) {
        const entry = received.manifest.files[index]!;
        const bytes = received.files[index]!;
        // The whole claim, in one line per file.
        expect(digest(bytes), `${original.name} bytes`).toBe(digest(original.bytes));
        expect(bytes.byteLength, `${original.name} size`).toBe(original.bytes.byteLength);
        expect(entry.name, `${original.name} name`).toBe(safeFileName(original.name));
        expect(entry.type, `${original.name} type`).toBe(safeMediaType(original.mediaType));
      }
    }, 120_000);
  }

  it("keeps a name that needed no changing exactly as it was chosen", async () => {
    // Every sample in the matrix is already a name the policy accepts, so the
    // round trip must not alter a single one of them.
    for (const { files } of ALL_SAMPLE_GROUPS) {
      for (const file of files) {
        expect(safeFileName(file.name)).toBe(file.name);
      }
    }
  });

  it("carries an empty file, and an almost-empty one", async () => {
    const received = await roundTrip([
      { name: "empty.txt", mediaType: "text/plain", bytes: new Uint8Array() },
      { name: "one-byte.bin", mediaType: "", bytes: new Uint8Array([0x42]) },
    ]);
    expect(received.files[0]?.byteLength).toBe(0);
    expect(received.manifest.files[0]?.size).toBe(0);
    expect(received.files[1]).toEqual(new Uint8Array([0x42]));
  }, 60_000);

  it("carries a file that spans several chunks, tail included", async () => {
    // Two whole chunks and a short remainder: the case where an off-by-one in
    // part layout or a lost tail would show up as a digest mismatch.
    const bytes = new Uint8Array(DROP_CHUNK_BYTES * 2 + 1234);
    for (let index = 0; index < bytes.byteLength; index += 1) bytes[index] = (index * 31) & 0xff;

    const received = await roundTrip([{ name: "video.mp4", mediaType: "video/mp4", bytes }]);

    expect(received.manifest.files[0]?.chunkCount).toBe(3);
    expect(digest(received.files[0]!)).toBe(digest(bytes));
  }, 180_000);

  it("carries twenty files in one transfer without mixing them up", async () => {
    // Per-file keys and position-bound additional data are what stop file three
    // decrypting into file four's contents; twenty distinct payloads is how
    // that gets checked rather than assumed.
    const files: SyntheticFile[] = Array.from({ length: 20 }, (_, index) => ({
      name: `파일-${index}.bin`,
      mediaType: "application/octet-stream",
      bytes: new Uint8Array(64).fill(index),
    }));

    const received = await roundTrip(files);

    for (const [index, original] of files.entries()) {
      expect(digest(received.files[index]!)).toBe(digest(original.bytes));
      expect(received.manifest.files[index]?.name).toBe(original.name);
    }
  }, 120_000);

  it("refuses a chunk that was moved, reordered, or truncated", async () => {
    const keys = await deriveDropKeys(generateDropCode());
    const files: SyntheticFile[] = [
      { name: "first.bin", mediaType: "", bytes: new Uint8Array(32).fill(1) },
      { name: "second.bin", mediaType: "", bytes: new Uint8Array(32).fill(2) },
    ];
    await send(keys, files);

    const manifest = files.map(manifestEntry);
    const fileKey = await deriveDropFileKey(keys, 0);
    const authorized = await downloadRoute(
      jsonRequest(`/api/drops/${keys.dropId}/download`, { indexes: [0] }),
      params(keys.dropId),
    );
    const { operations } = (await authorized.json()) as { operations: Operation[] };
    const response = await blobGetRoute(new Request(operations[0]!.url, { method: "GET" }));
    const ciphertext = new Uint8Array(await response.arrayBuffer());
    const context = { fileIndex: 0, chunkIndex: 0, chunkCount: 1, partIndex: 0 };

    // The honest reading works.
    await expect(decryptDropChunk(fileKey, keys, context, ciphertext)).resolves.toBeInstanceOf(
      Uint8Array,
    );
    // Read as another file's chunk, at another position, or with a bit flipped,
    // it fails authentication rather than producing plausible wrong bytes.
    const otherKey = await deriveDropFileKey(keys, 1);
    await expect(decryptDropChunk(otherKey, keys, context, ciphertext)).rejects.toThrow();
    await expect(
      decryptDropChunk(fileKey, keys, { ...context, partIndex: 1 }, ciphertext),
    ).rejects.toThrow();
    await expect(
      decryptDropChunk(fileKey, keys, { ...context, fileIndex: 1 }, ciphertext),
    ).rejects.toThrow();
    const tampered = ciphertext.slice();
    tampered[0] ^= 0x01;
    await expect(decryptDropChunk(fileKey, keys, context, tampered)).rejects.toThrow();
    await expect(
      decryptDropChunk(fileKey, keys, context, ciphertext.slice(0, ciphertext.byteLength - 1)),
    ).rejects.toThrow();
    expect(manifest).toHaveLength(2);
  }, 60_000);

  it("never lets a file name reach the service", async () => {
    const keys = await deriveDropKeys(generateDropCode());
    const files: SyntheticFile[] = [
      { name: "전입신고서.hwpx", mediaType: "", bytes: new Uint8Array(16).fill(7) },
    ];
    await send(keys, files);

    const opened = await openDropRoute(
      jsonRequest(`/api/drops/${keys.dropId}/open`, {}),
      params(keys.dropId),
    );
    const body = await opened.text();
    expect(body).not.toContain("전입신고서");
    expect(body).not.toContain("hwpx");
  }, 60_000);
});
