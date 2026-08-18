import {
  FILE_KIND_CODES,
  MAX_PLAINTEXT_BYTES,
  MAX_PRINT_BUNDLE_BYTES,
  MAX_PRINT_BUNDLE_FILES,
  fileKindFromCode,
  type PrintableFileKind,
} from "./envelope.js";

const BUNDLE_VERSION = 1;
const BUNDLE_HEADER_BYTES = 12;
const ENTRY_HEADER_BYTES = 8;
const BUNDLE_MAGIC = new Uint8Array([0x50, 0x43, 0x42, 0x4e, 0x44, 0x4c, 0x30, 0x31]);

export type PrintBundleItem = {
  fileKind: PrintableFileKind;
  bytes: Uint8Array;
};

/**
 * Encodes several already-normalized and already-validated print documents into
 * one plaintext container. The whole container is then encrypted by the normal
 * protocol envelope, so the server still stores one opaque blob per QR session.
 *
 * Filenames are deliberately absent: the kiosk only needs the format and bytes
 * to print, and a shared screen has no reason to learn a visitor's filenames.
 */
export function encodePrintBundle(items: readonly PrintBundleItem[]): Uint8Array {
  validateItemCount(items.length);
  let total = BUNDLE_HEADER_BYTES;
  for (const item of items) {
    validatePrintableItem(item);
    total = checkedAdd(total, ENTRY_HEADER_BYTES + item.bytes.byteLength);
  }
  if (total > MAX_PRINT_BUNDLE_BYTES) throw new PrintBundleError("Print bundle is too large");

  const output = new Uint8Array(total);
  output.set(BUNDLE_MAGIC, 0);
  const view = new DataView(output.buffer);
  view.setUint8(8, BUNDLE_VERSION);
  view.setUint8(9, items.length);
  view.setUint16(10, 0, false);

  let offset = BUNDLE_HEADER_BYTES;
  for (const item of items) {
    view.setUint8(offset, FILE_KIND_CODES[item.fileKind]);
    view.setUint8(offset + 1, 0);
    view.setUint16(offset + 2, 0, false);
    view.setUint32(offset + 4, item.bytes.byteLength, false);
    offset += ENTRY_HEADER_BYTES;
    output.set(item.bytes, offset);
    offset += item.bytes.byteLength;
  }
  return output;
}

/** Parses and copies every entry so callers can independently zero each item. */
export function parsePrintBundle(bytes: Uint8Array): PrintBundleItem[] {
  if (bytes.byteLength < BUNDLE_HEADER_BYTES || bytes.byteLength > MAX_PRINT_BUNDLE_BYTES) {
    throw new PrintBundleError("Print bundle size is invalid");
  }
  if (!fixedEqual(bytes.subarray(0, BUNDLE_MAGIC.length), BUNDLE_MAGIC)) {
    throw new PrintBundleError("Print bundle magic is invalid");
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint8(8) !== BUNDLE_VERSION || view.getUint16(10, false) !== 0) {
    throw new PrintBundleError("Print bundle version or flags are invalid");
  }
  const count = view.getUint8(9);
  validateItemCount(count);

  const items: PrintBundleItem[] = [];
  let offset = BUNDLE_HEADER_BYTES;
  try {
    for (let index = 0; index < count; index += 1) {
      if (offset + ENTRY_HEADER_BYTES > bytes.byteLength) {
        throw new PrintBundleError("Print bundle is truncated");
      }
      const kind = fileKindFromCode(view.getUint8(offset));
      if (kind === "bundle") throw new PrintBundleError("Nested print bundles are not supported");
      if (view.getUint8(offset + 1) !== 0 || view.getUint16(offset + 2, false) !== 0) {
        throw new PrintBundleError("Print bundle entry flags are invalid");
      }
      const length = view.getUint32(offset + 4, false);
      if (length < 1 || length > MAX_PLAINTEXT_BYTES) {
        throw new PrintBundleError("Print bundle entry size is invalid");
      }
      offset += ENTRY_HEADER_BYTES;
      if (offset + length > bytes.byteLength) throw new PrintBundleError("Print bundle is truncated");
      items.push({ fileKind: kind, bytes: bytes.slice(offset, offset + length) });
      offset += length;
    }
    if (offset !== bytes.byteLength) throw new PrintBundleError("Print bundle has trailing data");
    return items;
  } catch (error) {
    for (const item of items) item.bytes.fill(0);
    throw error;
  }
}

export function printBundleEncodedSize(items: readonly Pick<PrintBundleItem, "bytes">[]): number {
  let total = BUNDLE_HEADER_BYTES;
  for (const item of items) total = checkedAdd(total, ENTRY_HEADER_BYTES + item.bytes.byteLength);
  return total;
}

function validateItemCount(count: number): void {
  if (!Number.isInteger(count) || count < 1 || count > MAX_PRINT_BUNDLE_FILES) {
    throw new PrintBundleError(`Print bundle must contain 1-${MAX_PRINT_BUNDLE_FILES} files`);
  }
}

function validatePrintableItem(item: PrintBundleItem): void {
  if (item.bytes.byteLength < 1 || item.bytes.byteLength > MAX_PLAINTEXT_BYTES) {
    throw new PrintBundleError("Print bundle entry size is invalid");
  }
}

function checkedAdd(left: number, right: number): number {
  const value = left + right;
  if (!Number.isSafeInteger(value)) throw new PrintBundleError("Print bundle size overflow");
  return value;
}

function fixedEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false;
  let difference = 0;
  for (let index = 0; index < left.byteLength; index += 1) {
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }
  return difference === 0;
}

export class PrintBundleError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "PrintBundleError";
  }
}
