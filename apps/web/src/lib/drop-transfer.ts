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
  hashToken,
  generateToken,
  type DropKeys,
  type DropManifest,
  type DropManifestFile,
} from "@print-cess/crypto";
import {
  DROP_CHUNK_BYTES,
  MAX_DROP_FILES,
  MAX_DROP_FILE_NAME_LENGTH,
  MAX_DROP_PARTS,
} from "@print-cess/protocol";

import {
  ApiClientError,
  authorizeDropDownload,
  authorizeDropParts,
  commitDropParts,
  createDrop,
  openDrop,
  sealDrop,
  type DropOperation,
} from "./drop-client";
import { openDropWriter, type DropWriter } from "./drop-writer";

/** Parts authorized and transferred together. Matches the API's batch ceiling. */
const BATCH_SIZE = 8;
/**
 * Parallel part transfers. Three keeps a phone's radio busy without starving a
 * shared connection or holding four chunks in memory at once.
 */
const CONCURRENCY = 3;
const MAX_ATTEMPTS = 4;
const RETRY_BASE_MS = 700;

export class DropTransferError extends Error {
  public constructor(
    public readonly code: string,
    message = code,
  ) {
    super(message);
    this.name = "DropTransferError";
  }
}

export type DropProgress = {
  /** Plaintext bytes moved so far, across every file in the transfer. */
  transferredBytes: number;
  totalBytes: number;
  completedParts: number;
  totalParts: number;
};

export type SendResult = {
  code: string;
  dropId: string;
  ownerToken: string;
  expiresAt: number;
};

export type PreparedSelection = {
  files: File[];
  manifestFiles: DropManifestFile[];
  totalBytes: number;
  partCount: number;
};

export function prepareSelection(files: readonly File[]): PreparedSelection {
  if (files.length < 1) throw new DropTransferError("dropNoFiles");
  if (files.length > MAX_DROP_FILES) throw new DropTransferError("dropTooManyFiles");
  const accepted: File[] = [];
  const manifestFiles: DropManifestFile[] = [];
  let totalBytes = 0;
  for (const file of files) {
    if (file.size < 1) throw new DropTransferError("dropEmptyFile");
    accepted.push(file);
    manifestFiles.push({
      name: safeFileName(file.name),
      size: file.size,
      type: file.type.slice(0, 128),
      chunkCount: dropChunkCount(file.size),
    });
    totalBytes += file.size;
  }
  const partCount = dropTotalPartCount(manifestFiles);
  if (partCount > MAX_DROP_PARTS) throw new DropTransferError("dropTooLarge");
  return { files: accepted, manifestFiles, totalBytes, partCount };
}

/**
 * Encrypts and uploads a selection, one chunk at a time. Nothing larger than a
 * single chunk is ever held in memory, so a two-gigabyte transfer costs the
 * same working set as an eight-megabyte one.
 */
export async function sendDrop(
  selection: PreparedSelection,
  options: {
    signal?: AbortSignal;
    onProgress?: (progress: DropProgress) => void;
    onCodeReady?: (code: string) => void;
  } = {},
): Promise<SendResult> {
  const code = generateDropCode();
  options.onCodeReady?.(code);
  const keys = await deriveDropKeys(code);
  const manifest: DropManifest = { protocolVersion: 1, files: selection.manifestFiles };
  const sealedManifest = await encryptDropManifest(keys, manifest);
  const ownerToken = generateToken(32);

  const created = await createDrop({
    dropId: keys.dropId,
    ownerTokenHash: await hashToken(ownerToken, "drop"),
    manifest: sealedManifest,
    fileCount: selection.files.length,
    partCount: selection.partCount,
  });

  const progress: DropProgress = {
    transferredBytes: 0,
    totalBytes: selection.totalBytes,
    completedParts: 0,
    totalParts: selection.partCount,
  };
  const plan = buildPlan(selection);

  for (let start = 0; start < plan.length; start += BATCH_SIZE) {
    throwIfAborted(options.signal);
    const batch = plan.slice(start, start + BATCH_SIZE);
    const operations = await withRetry(
      () =>
        authorizeDropParts(
          created.dropId,
          ownerToken,
          batch.map((entry) => entry.partIndex),
        ),
      options.signal,
    );
    const byIndex = new Map(operations.map((operation) => [operation.index, operation]));

    await runWithConcurrency(batch, CONCURRENCY, async (entry) => {
      if (!byIndex.has(entry.partIndex)) throw new DropTransferError("dropUploadFailed");
      const ciphertext = await encryptPlannedChunk(selection, keys, entry);
      try {
        await withRetry(
          () => {
            const currentOperation = byIndex.get(entry.partIndex);
            if (!currentOperation) throw new DropTransferError("dropUploadFailed");
            return putCiphertext(currentOperation, ciphertext, options.signal);
          },
          options.signal,
          async () => {
            // A signed URL can expire mid-retry; ask for a fresh one. The next
            // attempt resolves from this map instead of closing over the stale
            // operation that failed.
            const refreshed = await authorizeDropParts(created.dropId, ownerToken, [
              entry.partIndex,
            ]);
            const next = refreshed[0];
            if (next) byIndex.set(entry.partIndex, next);
            return next;
          },
        );
      } finally {
        ciphertext.fill(0);
      }
      progress.transferredBytes += entry.plaintextBytes;
      progress.completedParts += 1;
      options.onProgress?.({ ...progress });
    });

    await withRetry(
      () =>
        commitDropParts(
          created.dropId,
          ownerToken,
          batch.map((entry) => ({
            index: entry.partIndex,
            size: entry.plaintextBytes + 16,
          })),
        ),
      options.signal,
    );
  }

  await withRetry(() => sealDrop(created.dropId, ownerToken), options.signal);
  return { code, dropId: created.dropId, ownerToken, expiresAt: created.expiresAt };
}

export type ReceivedDrop = {
  keys: DropKeys;
  dropId: string;
  manifest: DropManifest;
  partSizes: number[];
  totalBytes: number;
  expiresAt: number;
};

/** Reads the file list without downloading a byte of content. */
export async function inspectDrop(rawCode: string): Promise<ReceivedDrop> {
  const keys = await deriveDropKeys(rawCode);
  let view;
  try {
    view = await openDrop(keys.dropId);
  } catch (error) {
    if (error instanceof ApiClientError && error.status === 404) {
      throw new DropTransferError("dropCodeNotFound");
    }
    if (error instanceof ApiClientError && error.status === 410) {
      throw new DropTransferError("dropExpired");
    }
    if (error instanceof ApiClientError && error.status === 429) {
      throw new DropTransferError("dropTooManyTries");
    }
    throw new DropTransferError("dropNetworkError");
  }
  let manifest: DropManifest;
  try {
    manifest = await decryptDropManifest(keys, view.manifest, view.fileCount);
  } catch {
    // The identifier matched but the content key did not: the code was mistyped
    // in a way that still produced a valid-looking identifier, or it is stale.
    throw new DropTransferError("dropCodeNotFound");
  }
  return {
    keys,
    dropId: view.dropId,
    manifest,
    partSizes: view.partSizes,
    totalBytes: manifest.files.reduce((total, file) => total + file.size, 0),
    expiresAt: view.expiresAt,
  };
}

/**
 * Downloads, authenticates, and writes one file. Chunks are streamed straight
 * into the writer, so the phone never holds more than one chunk plus whatever
 * the writer has not yet flushed.
 */
export async function receiveDropFile(
  drop: ReceivedDrop,
  fileIndex: number,
  options: {
    signal?: AbortSignal;
    onProgress?: (progress: DropProgress) => void;
  } = {},
): Promise<void> {
  const file = drop.manifest.files[fileIndex];
  if (!file) throw new DropTransferError("dropFileMissing");
  const writer: DropWriter = await openDropWriter(file);
  const fileKey = await deriveDropFileKey(drop.keys, fileIndex);
  const progress: DropProgress = {
    transferredBytes: 0,
    totalBytes: file.size,
    completedParts: 0,
    totalParts: file.chunkCount,
  };

  try {
    for (let start = 0; start < file.chunkCount; start += BATCH_SIZE) {
      throwIfAborted(options.signal);
      const chunkIndexes = Array.from(
        { length: Math.min(BATCH_SIZE, file.chunkCount - start) },
        (_, offset) => start + offset,
      );
      const partIndexes = chunkIndexes.map((chunkIndex) =>
        dropPartIndex(drop.manifest.files, fileIndex, chunkIndex),
      );
      const operations = await withRetry(
        () => authorizeDropDownload(drop.dropId, partIndexes),
        options.signal,
      );
      const byIndex = new Map(operations.map((operation) => [operation.index, operation]));

      // Written strictly in order: the writer is a stream, so a parallel fetch
      // would have to buffer whole chunks to restore ordering anyway.
      for (const chunkIndex of chunkIndexes) {
        const partIndex = dropPartIndex(drop.manifest.files, fileIndex, chunkIndex);
        if (!byIndex.has(partIndex)) throw new DropTransferError("dropDownloadFailed");
        const ciphertext = await withRetry(
          () => {
            const currentOperation = byIndex.get(partIndex);
            if (!currentOperation) throw new DropTransferError("dropDownloadFailed");
            return getCiphertext(currentOperation, options.signal);
          },
          options.signal,
          async () => {
            const refreshed = await authorizeDropDownload(drop.dropId, [partIndex]);
            const next = refreshed[0];
            if (next) byIndex.set(partIndex, next);
            return next;
          },
        );
        let plaintext: Uint8Array;
        try {
          plaintext = await decryptDropChunk(
            fileKey,
            drop.keys,
            { fileIndex, chunkIndex, chunkCount: file.chunkCount, partIndex },
            ciphertext,
          );
        } catch {
          throw new DropTransferError("dropDamaged");
        } finally {
          ciphertext.fill(0);
        }
        await writer.write(plaintext);
        progress.transferredBytes += plaintext.byteLength;
        progress.completedParts += 1;
        plaintext.fill(0);
        options.onProgress?.({ ...progress });
      }
    }
    if (progress.transferredBytes !== file.size) throw new DropTransferError("dropDamaged");
    await writer.finish();
  } catch (error) {
    await writer.abort();
    throw error;
  }
}

type PlannedChunk = {
  fileIndex: number;
  chunkIndex: number;
  chunkCount: number;
  partIndex: number;
  offset: number;
  plaintextBytes: number;
};

function buildPlan(selection: PreparedSelection): PlannedChunk[] {
  const plan: PlannedChunk[] = [];
  selection.manifestFiles.forEach((file, fileIndex) => {
    for (let chunkIndex = 0; chunkIndex < file.chunkCount; chunkIndex += 1) {
      const offset = chunkIndex * DROP_CHUNK_BYTES;
      plan.push({
        fileIndex,
        chunkIndex,
        chunkCount: file.chunkCount,
        partIndex: dropPartIndex(selection.manifestFiles, fileIndex, chunkIndex),
        offset,
        plaintextBytes: Math.min(DROP_CHUNK_BYTES, file.size - offset),
      });
    }
  });
  return plan;
}

async function encryptPlannedChunk(
  selection: PreparedSelection,
  keys: DropKeys,
  entry: PlannedChunk,
): Promise<Uint8Array> {
  const file = selection.files[entry.fileIndex];
  if (!file) throw new DropTransferError("dropFileMissing");
  const slice = file.slice(entry.offset, entry.offset + entry.plaintextBytes);
  let plaintext: Uint8Array;
  try {
    plaintext = new Uint8Array(await slice.arrayBuffer());
  } catch {
    // Typically the file was moved or the photo library revoked the handle.
    throw new DropTransferError("dropFileUnreadable");
  }
  if (plaintext.byteLength !== entry.plaintextBytes) {
    throw new DropTransferError("dropFileChanged");
  }
  const fileKey = await deriveDropFileKey(keys, entry.fileIndex);
  try {
    return await encryptDropChunk(
      fileKey,
      keys,
      {
        fileIndex: entry.fileIndex,
        chunkIndex: entry.chunkIndex,
        chunkCount: entry.chunkCount,
        partIndex: entry.partIndex,
      },
      plaintext,
    );
  } finally {
    plaintext.fill(0);
  }
}

async function putCiphertext(
  operation: DropOperation,
  bytes: Uint8Array,
  signal?: AbortSignal,
): Promise<void> {
  const response = await fetch(operation.url, {
    method: "PUT",
    headers: operation.headers,
    body: Uint8Array.from(bytes).buffer,
    signal: combineSignals(signal, 180_000),
  });
  if (!response.ok) {
    throw new ApiClientError("networkError", "Part upload failed", response.status);
  }
}

async function getCiphertext(operation: DropOperation, signal?: AbortSignal): Promise<Uint8Array> {
  const response = await fetch(operation.url, {
    method: "GET",
    headers: operation.headers,
    cache: "no-store",
    signal: combineSignals(signal, 180_000),
  });
  if (!response.ok) {
    throw new ApiClientError("networkError", "Part download failed", response.status);
  }
  return new Uint8Array(await response.arrayBuffer());
}

async function runWithConcurrency<T>(
  items: readonly T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const item = items[cursor];
      cursor += 1;
      if (item !== undefined) await worker(item);
    }
  });
  await Promise.all(runners);
}

/**
 * Retries the transient half of the failure space — lost signal, an expired
 * signed URL, a provider hiccup — and gives up immediately on anything the
 * caller cannot fix by trying again, such as an expired transfer.
 */
async function withRetry<T>(
  action: () => Promise<T>,
  signal?: AbortSignal,
  refresh?: () => Promise<unknown>,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    throwIfAborted(signal);
    try {
      return await action();
    } catch (error) {
      lastError = error;
      if (error instanceof DropTransferError) throw error;
      if (error instanceof ApiClientError && isFatalStatus(error.status, Boolean(refresh))) {
        throw toTransferError(error);
      }
      if (attempt === MAX_ATTEMPTS - 1) break;
      await delay(RETRY_BASE_MS * 2 ** attempt, signal);
      if (refresh) await refresh().catch(() => undefined);
    }
  }
  throw toTransferError(lastError);
}

function isFatalStatus(status: number, canRefreshBlobCredential = false): boolean {
  // A 401 from our JSON API is an owner/auth failure and must stop immediately.
  // A 401 from a signed blob operation can simply mean that its short-lived
  // credential expired; callers that supply `refresh` are precisely those blob
  // operations, so let them obtain a replacement before the next attempt.
  if (status === 401 && canRefreshBlobCredential) return false;
  return status === 400 || status === 401 || status === 404 || status === 409 || status === 410;
}

function toTransferError(error: unknown): DropTransferError {
  if (error instanceof DropTransferError) return error;
  if (error instanceof ApiClientError) {
    if (error.status === 410) return new DropTransferError("dropExpired");
    if (error.status === 413) return new DropTransferError("dropTooLarge");
    if (error.status === 429) return new DropTransferError("dropTooManyTries");
    if (error.status === 404) return new DropTransferError("dropCodeNotFound");
  }
  if (error instanceof DOMException && error.name === "AbortError") {
    return new DropTransferError("dropCancelled");
  }
  return new DropTransferError("dropNetworkError");
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      window.clearTimeout(timer);
      reject(new DropTransferError("dropCancelled"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function combineSignals(signal: AbortSignal | undefined, timeoutMs: number): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DropTransferError("dropCancelled");
}

/**
 * A name arrives from another person's device, so it is treated as untrusted
 * text: path separators and control characters are removed before it can reach
 * a file system, and the length is bounded.
 */
function safeFileName(name: string): string {
  const cleaned = name
    .replace(/[\u0000-\u001f\u007f/\\:*?"<>|]/gu, "_")
    .replace(/^\.+/u, "_")
    .trim();
  const bounded = cleaned.slice(0, MAX_DROP_FILE_NAME_LENGTH);
  return bounded.length > 0 ? bounded : "file";
}

export { safeFileName };
