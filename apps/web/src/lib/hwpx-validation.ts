const HWPX_MIME_TYPE = "application/hwp+zip";
const ZIP_LOCAL_HEADER = 0x04034b50;

export function isHwpxSelection(file: Pick<File, "name" | "type">): boolean {
  return file.name.toLowerCase().endsWith(".hwpx") || file.type === HWPX_MIME_TYPE;
}

export function validateHwpxHeader(bytes: Uint8Array): void {
  if (bytes.byteLength < 30 || readUint32(bytes, 0) !== ZIP_LOCAL_HEADER) {
    throw new Error("invalid HWPX ZIP header");
  }

  const flags = readUint16(bytes, 6);
  const compressionMethod = readUint16(bytes, 8);
  const compressedSize = readUint32(bytes, 18);
  const uncompressedSize = readUint32(bytes, 22);
  const nameLength = readUint16(bytes, 26);
  const extraLength = readUint16(bytes, 28);
  const dataOffset = 30 + nameLength + extraLength;
  if (
    (flags & 0x0001) !== 0 ||
    (flags & 0x0008) !== 0 ||
    compressionMethod !== 0 ||
    dataOffset + compressedSize > bytes.byteLength
  ) {
    throw new Error("invalid HWPX mimetype entry");
  }

  const name = new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(30, 30 + nameLength));
  const mime = new TextDecoder("utf-8", { fatal: true }).decode(
    bytes.subarray(dataOffset, dataOffset + compressedSize),
  );
  if (
    name !== "mimetype" ||
    compressedSize !== uncompressedSize ||
    mime.trim() !== HWPX_MIME_TYPE
  ) {
    throw new Error("invalid HWPX package identity");
  }
}

function readUint16(bytes: Uint8Array, offset: number): number {
  if (offset + 2 > bytes.byteLength) throw new Error("truncated HWPX header");
  return new DataView(bytes.buffer, bytes.byteOffset + offset, 2).getUint16(0, true);
}

function readUint32(bytes: Uint8Array, offset: number): number {
  if (offset + 4 > bytes.byteLength) throw new Error("truncated HWPX header");
  return new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0, true);
}
