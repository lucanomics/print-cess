import {
  DROP_CHUNK_BYTES,
  DROP_CODE_ALPHABET,
  DROP_CODE_KDF_ITERATIONS,
  DROP_CODE_KDF_SALT,
  DROP_CODE_LENGTH,
  DROP_CODE_PATTERN,
  DROP_HKDF_INFO,
  DROP_ID_PATTERN,
  DROP_PART_TAG_BYTES,
  MAX_DROP_FILES,
  MAX_DROP_FILE_NAME_LENGTH,
  MAX_DROP_MIME_LENGTH,
  MAX_DROP_PARTS,
  normalizeDropCode,
} from "@print-cess/protocol";

import { fromBase64Url, toBase64Url } from "./encoding.js";
import { asArrayBuffer, cryptoRuntime } from "./runtime.js";

const AES_GCM_IV_BYTES = 12;
const CHUNK_AAD_DOMAIN = "print-cess-by-paradiso:drop-chunk:v1";
const MANIFEST_AAD_DOMAIN = "print-cess-by-paradiso:drop-manifest:v1";
const encoder = new TextEncoder();

export type DropKeys = {
  /** Sent to the server; it identifies the ciphertext and reveals nothing else. */
  dropId: string;
  /** Opens the file list. Never leaves the device. */
  manifestKey: CryptoKey;
  /** Root for the per-file content keys. Never leaves the device. */
  rootKey: CryptoKey;
  dropIdBytes: Uint8Array;
};

export type DropManifestFile = {
  name: string;
  size: number;
  type: string;
  chunkCount: number;
};

export type DropManifest = {
  protocolVersion: 1;
  files: DropManifestFile[];
};

export class DropCodeError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "DropCodeError";
  }
}

/** A fresh transfer code, drawn without modulo bias from the 32-symbol alphabet. */
export function generateDropCode(length = DROP_CODE_LENGTH): string {
  const runtime = cryptoRuntime();
  let code = "";
  while (code.length < length) {
    const candidates = runtime.getRandomValues(new Uint8Array(length));
    for (const byte of candidates) {
      // 256 is not a multiple of 32, but 32 divides 256 exactly (8 * 32), so
      // every byte maps uniformly with a plain mask.
      code += DROP_CODE_ALPHABET[byte & 0x1f];
      if (code.length === length) break;
    }
  }
  return code;
}

/**
 * Stretches the transfer code into the storage identifier and the content keys.
 * PBKDF2 is deliberate: the code carries about sixty bits, so the work factor
 * is what stands between leaked ciphertext and an offline search.
 */
export async function deriveDropKeys(rawCode: string): Promise<DropKeys> {
  const code = normalizeDropCode(rawCode);
  if (!DROP_CODE_PATTERN.test(code)) {
    throw new DropCodeError("A transfer code is twelve characters long");
  }
  const subtle = cryptoRuntime().subtle;
  const codeBytes = encoder.encode(code);
  const material = await subtle.importKey("raw", asArrayBuffer(codeBytes), "PBKDF2", false, [
    "deriveBits",
  ]);
  const stretched = new Uint8Array(
    await subtle.deriveBits(
      {
        name: "PBKDF2",
        hash: "SHA-256",
        salt: asArrayBuffer(encoder.encode(DROP_CODE_KDF_SALT)),
        iterations: DROP_CODE_KDF_ITERATIONS,
      },
      material,
      384,
    ),
  );
  codeBytes.fill(0);

  const dropIdBytes = stretched.slice(0, 16);
  const secret = stretched.slice(16, 48);
  stretched.fill(0);
  const dropId = toBase64Url(dropIdBytes);
  try {
    const rootKey = await subtle.importKey("raw", asArrayBuffer(secret), "HKDF", false, [
      "deriveKey",
      "deriveBits",
    ]);
    const manifestKey = await deriveAesKey(rootKey, dropIdBytes, "manifest");
    return { dropId, dropIdBytes, manifestKey, rootKey };
  } finally {
    secret.fill(0);
  }
}

/** One AES-GCM key per file, so a chunk counter alone keeps every IV unique. */
export async function deriveDropFileKey(keys: DropKeys, fileIndex: number): Promise<CryptoKey> {
  assertIndex(fileIndex, MAX_DROP_FILES, "file");
  return deriveAesKey(keys.rootKey, keys.dropIdBytes, `file:${fileIndex}`);
}

export type DropChunkContext = {
  fileIndex: number;
  chunkIndex: number;
  chunkCount: number;
  partIndex: number;
};

export async function encryptDropChunk(
  key: CryptoKey,
  keys: DropKeys,
  context: DropChunkContext,
  plaintext: Uint8Array,
): Promise<Uint8Array> {
  // An empty file is a real file, and a general transport that refuses one is
  // simply broken. AES-GCM over empty plaintext yields the authentication tag
  // alone, which is a complete, authenticated, correctly sized part: the
  // chunk's position and its transfer are still bound through the same AAD, so
  // nothing about the security argument changes.
  if (plaintext.byteLength > DROP_CHUNK_BYTES) {
    throw new Error("A drop chunk must not exceed the chunk size");
  }
  const ciphertext = await cryptoRuntime().subtle.encrypt(
    {
      name: "AES-GCM",
      iv: asArrayBuffer(chunkIv(context.chunkIndex)),
      additionalData: asArrayBuffer(chunkAad(keys, context)),
      tagLength: DROP_PART_TAG_BYTES * 8,
    },
    key,
    asArrayBuffer(plaintext),
  );
  return new Uint8Array(ciphertext);
}

export async function decryptDropChunk(
  key: CryptoKey,
  keys: DropKeys,
  context: DropChunkContext,
  ciphertext: Uint8Array,
): Promise<Uint8Array> {
  const plaintext = await cryptoRuntime().subtle.decrypt(
    {
      name: "AES-GCM",
      iv: asArrayBuffer(chunkIv(context.chunkIndex)),
      additionalData: asArrayBuffer(chunkAad(keys, context)),
      tagLength: DROP_PART_TAG_BYTES * 8,
    },
    key,
    asArrayBuffer(ciphertext),
  );
  return new Uint8Array(plaintext);
}

export async function encryptDropManifest(keys: DropKeys, manifest: DropManifest): Promise<string> {
  assertManifest(manifest);
  const plaintext = encoder.encode(JSON.stringify(manifest));
  const iv = cryptoRuntime().getRandomValues(new Uint8Array(AES_GCM_IV_BYTES));
  const ciphertext = new Uint8Array(
    await cryptoRuntime().subtle.encrypt(
      {
        name: "AES-GCM",
        iv: asArrayBuffer(iv),
        additionalData: asArrayBuffer(manifestAad(keys, manifest.files.length)),
        tagLength: DROP_PART_TAG_BYTES * 8,
      },
      keys.manifestKey,
      asArrayBuffer(plaintext),
    ),
  );
  plaintext.fill(0);
  const sealed = new Uint8Array(iv.byteLength + ciphertext.byteLength);
  sealed.set(iv, 0);
  sealed.set(ciphertext, iv.byteLength);
  return toBase64Url(sealed);
}

export async function decryptDropManifest(
  keys: DropKeys,
  sealedManifest: string,
  fileCount: number,
): Promise<DropManifest> {
  const sealed = fromBase64Url(sealedManifest);
  if (sealed.byteLength <= AES_GCM_IV_BYTES + DROP_PART_TAG_BYTES) {
    throw new Error("The encrypted file list is truncated");
  }
  const plaintext = new Uint8Array(
    await cryptoRuntime().subtle.decrypt(
      {
        name: "AES-GCM",
        iv: asArrayBuffer(sealed.subarray(0, AES_GCM_IV_BYTES)),
        additionalData: asArrayBuffer(manifestAad(keys, fileCount)),
        tagLength: DROP_PART_TAG_BYTES * 8,
      },
      keys.manifestKey,
      asArrayBuffer(sealed.subarray(AES_GCM_IV_BYTES)),
    ),
  );
  let manifest: unknown;
  try {
    manifest = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(plaintext));
  } catch {
    throw new Error("The file list could not be read");
  } finally {
    plaintext.fill(0);
  }
  assertManifest(manifest);
  if (manifest.files.length !== fileCount) {
    throw new Error("The file list does not match the transfer");
  }
  return manifest;
}

/** Flat part index for a chunk, so both sides agree on storage order. */
export function dropPartIndex(
  files: readonly Pick<DropManifestFile, "chunkCount">[],
  fileIndex: number,
  chunkIndex: number,
): number {
  let offset = 0;
  for (let index = 0; index < fileIndex; index += 1) {
    offset += files[index]?.chunkCount ?? 0;
  }
  return offset + chunkIndex;
}

export function dropChunkCount(size: number): number {
  return Math.max(1, Math.ceil(size / DROP_CHUNK_BYTES));
}

export function dropTotalPartCount(files: readonly Pick<DropManifestFile, "chunkCount">[]): number {
  return files.reduce((total, file) => total + file.chunkCount, 0);
}

async function deriveAesKey(
  rootKey: CryptoKey,
  salt: Uint8Array,
  purpose: string,
): Promise<CryptoKey> {
  return cryptoRuntime().subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: asArrayBuffer(salt),
      info: asArrayBuffer(encoder.encode(`${DROP_HKDF_INFO}:${purpose}`)),
    },
    rootKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

function chunkIv(chunkIndex: number): Uint8Array {
  assertIndex(chunkIndex, MAX_DROP_PARTS, "chunk");
  const iv = new Uint8Array(AES_GCM_IV_BYTES);
  new DataView(iv.buffer).setUint32(AES_GCM_IV_BYTES - 4, chunkIndex, false);
  return iv;
}

/**
 * Binds every chunk to its transfer, its file, and its exact position. A chunk
 * moved between files or transfers, reordered, or dropped from the end of a
 * file fails authentication instead of decrypting into a corrupt result.
 */
function chunkAad(keys: DropKeys, context: DropChunkContext): Uint8Array {
  assertIndex(context.fileIndex, MAX_DROP_FILES, "file");
  assertIndex(context.chunkIndex, MAX_DROP_PARTS, "chunk");
  assertIndex(context.partIndex, MAX_DROP_PARTS, "part");
  if (context.chunkIndex >= context.chunkCount) {
    throw new Error("A chunk index must fall inside its file");
  }
  const domain = encoder.encode(CHUNK_AAD_DOMAIN);
  const aad = new Uint8Array(domain.byteLength + 1 + keys.dropIdBytes.byteLength + 16);
  aad.set(domain, 0);
  aad.set(keys.dropIdBytes, domain.byteLength + 1);
  const view = new DataView(aad.buffer, domain.byteLength + 1 + keys.dropIdBytes.byteLength);
  view.setUint32(0, context.fileIndex, false);
  view.setUint32(4, context.chunkIndex, false);
  view.setUint32(8, context.chunkCount, false);
  view.setUint32(12, context.partIndex, false);
  return aad;
}

function manifestAad(keys: DropKeys, fileCount: number): Uint8Array {
  const domain = encoder.encode(MANIFEST_AAD_DOMAIN);
  const aad = new Uint8Array(domain.byteLength + 1 + keys.dropIdBytes.byteLength + 4);
  aad.set(domain, 0);
  aad.set(keys.dropIdBytes, domain.byteLength + 1);
  new DataView(aad.buffer, domain.byteLength + 1 + keys.dropIdBytes.byteLength).setUint32(
    0,
    fileCount,
    false,
  );
  return aad;
}

function assertManifest(value: unknown): asserts value is DropManifest {
  if (!value || typeof value !== "object") throw new Error("The file list is invalid");
  const candidate = value as Partial<DropManifest>;
  if (candidate.protocolVersion !== 1 || !Array.isArray(candidate.files)) {
    throw new Error("The file list is invalid");
  }
  if (candidate.files.length < 1 || candidate.files.length > MAX_DROP_FILES) {
    throw new Error("The file list is invalid");
  }
  for (const file of candidate.files) {
    if (
      !file ||
      typeof file.name !== "string" ||
      file.name.length < 1 ||
      file.name.length > MAX_DROP_FILE_NAME_LENGTH ||
      typeof file.type !== "string" ||
      file.type.length > MAX_DROP_MIME_LENGTH ||
      !Number.isSafeInteger(file.size) ||
      file.size < 0 ||
      !Number.isSafeInteger(file.chunkCount) ||
      file.chunkCount < 1 ||
      file.chunkCount > MAX_DROP_PARTS ||
      file.chunkCount !== dropChunkCount(file.size)
    ) {
      throw new Error("The file list is invalid");
    }
  }
}

export function assertDropId(dropId: string): void {
  if (!DROP_ID_PATTERN.test(dropId)) throw new Error("Invalid drop identifier");
}

function assertIndex(value: number, exclusiveMaximum: number, label: string): void {
  if (!Number.isInteger(value) || value < 0 || value >= exclusiveMaximum) {
    throw new Error(`Invalid ${label} index`);
  }
}
