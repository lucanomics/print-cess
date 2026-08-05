const HWP_MIME_TYPES = new Set([
  "application/x-hwp",
  "application/haansofthwp",
  "application/vnd.hancom.hwp",
]);

const COMPOUND_FILE_SIGNATURE = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
const HWP_FILE_HEADER_SIGNATURE = new TextEncoder().encode("HWP Document File");
const REJECTED_PROPERTY_MASK = (1 << 1) | (1 << 2) | (1 << 3) | (1 << 4) | (1 << 8);

export function isHwpSelection(file: Pick<File, "name" | "type">): boolean {
  return file.name.toLowerCase().endsWith(".hwp") || HWP_MIME_TYPES.has(file.type.toLowerCase());
}

export function validateHwpHeader(bytes: Uint8Array): void {
  if (
    bytes.byteLength < 512 ||
    !fixedBytesEqual(bytes.subarray(0, COMPOUND_FILE_SIGNATURE.length), COMPOUND_FILE_SIGNATURE)
  ) {
    throw new Error("invalid HWP compound-file signature");
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint16(0x1c, true) !== 0xfffe) throw new Error("invalid HWP byte order");
  const sectorShift = view.getUint16(0x1e, true);
  if (sectorShift !== 9 && sectorShift !== 12) throw new Error("invalid HWP sector size");
  if (view.getUint16(0x20, true) !== 6 || view.getUint32(0x38, true) !== 4096) {
    throw new Error("invalid HWP compound-file header");
  }

  const markerOffset = indexOfBytes(bytes, HWP_FILE_HEADER_SIGNATURE);
  if (markerOffset < 0 || markerOffset + 40 > bytes.byteLength) {
    throw new Error("missing HWP file header");
  }
  if (!containsUtf16Name(bytes, "FileHeader") || !containsUtf16Name(bytes, "DocInfo")) {
    throw new Error("missing HWP document streams");
  }

  const properties = view.getUint32(markerOffset + 36, true);
  if ((properties & REJECTED_PROPERTY_MASK) !== 0) {
    throw new Error("protected or active HWP document");
  }

  for (const name of ["Scripts", "DefaultJScript", "JScriptVersion", "_VBA_PROJECT", "Macros"]) {
    if (containsUtf16Name(bytes, name)) throw new Error("active HWP content");
  }
}

function containsUtf16Name(bytes: Uint8Array, value: string): boolean {
  const encoded = new Uint8Array(
    [...value].flatMap((character) => [
      character.charCodeAt(0) & 0xff,
      character.charCodeAt(0) >> 8,
    ]),
  );
  return indexOfBytes(bytes, encoded) >= 0;
}

function indexOfBytes(bytes: Uint8Array, needle: Uint8Array): number {
  outer: for (let offset = 0; offset <= bytes.byteLength - needle.byteLength; offset += 1) {
    for (let index = 0; index < needle.byteLength; index += 1) {
      if (bytes[offset + index] !== needle[index]) continue outer;
    }
    return offset;
  }
  return -1;
}

function fixedBytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false;
  let difference = 0;
  for (let index = 0; index < left.byteLength; index += 1) {
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }
  return difference === 0;
}
