import type { DropManifestFile } from "@print-cess/crypto";

/** How long a saved file's object URL stays alive for the browser to fetch it. */
const OBJECT_URL_LIFETIME_MS = 120_000;
const STAGING_DIRECTORY = "print-cess-drops";

export interface DropWriter {
  write(chunk: Uint8Array): Promise<void>;
  /** Hands the assembled file to the browser's download machinery. */
  finish(): Promise<void>;
  abort(): Promise<void>;
}

/**
 * Picks the best place to assemble a received file.
 *
 * The private origin file system is preferred because it keeps a multi-gigabyte
 * download off the JavaScript heap — chunks go straight to disk and only the
 * finished file is handed back. Browsers without it fall back to collecting
 * chunks in memory, which is fine for the sizes those browsers realistically
 * handle.
 */
export async function openDropWriter(file: DropManifestFile): Promise<DropWriter> {
  const staged = await openStagedWriter(file);
  return staged ?? openMemoryWriter(file);
}

/** True when a large transfer can be received without buffering it in memory. */
export function supportsStreamingSave(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.storage?.getDirectory === "function";
}

type StagedHandles = {
  directory: FileSystemDirectoryHandle;
  handle: FileSystemFileHandle;
  writable: FileSystemWritableFileStream;
  name: string;
};

async function openStagedWriter(file: DropManifestFile): Promise<DropWriter | null> {
  if (!supportsStreamingSave()) return null;
  let staged: StagedHandles;
  try {
    const root = await navigator.storage.getDirectory();
    const directory = await root.getDirectoryHandle(STAGING_DIRECTORY, { create: true });
    // A unique staging name keeps two simultaneous downloads of the same file
    // name from writing over each other.
    const name = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const handle = await directory.getFileHandle(name, { create: true });
    if (typeof handle.createWritable !== "function") return null;
    const writable = await handle.createWritable();
    staged = { directory, handle, writable, name };
  } catch {
    // Private browsing modes and locked-down origins can refuse storage.
    return null;
  }

  return {
    async write(chunk) {
      await staged.writable.write(Uint8Array.from(chunk).buffer);
    },
    async finish() {
      await staged.writable.close();
      const assembled = await staged.handle.getFile();
      saveBlob(new File([assembled], file.name, fileOptions(file.type)), file.name);
      // The staged copy has served its purpose; remove it once the browser has
      // had time to read the object URL.
      window.setTimeout(() => {
        void staged.directory.removeEntry(staged.name).catch(() => undefined);
      }, OBJECT_URL_LIFETIME_MS);
    },
    async abort() {
      await staged.writable.abort().catch(() => undefined);
      await staged.directory.removeEntry(staged.name).catch(() => undefined);
    },
  };
}

function openMemoryWriter(file: DropManifestFile): DropWriter {
  let chunks: Uint8Array[] = [];
  return {
    async write(chunk) {
      // The chunk is zeroed by the caller after this returns, so keep a copy.
      chunks.push(chunk.slice());
    },
    async finish() {
      const parts = chunks.map((chunk) => Uint8Array.from(chunk).buffer as BlobPart);
      chunks = [];
      saveBlob(new File(parts, file.name, fileOptions(file.type)), file.name);
    },
    async abort() {
      for (const chunk of chunks) chunk.fill(0);
      chunks = [];
    },
  };
}

/** A blank media type must be omitted, not passed through as an empty string. */
function fileOptions(type: string): FilePropertyBag {
  return type ? { type } : {};
}

function saveBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.rel = "noopener";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), OBJECT_URL_LIFETIME_MS);
}
