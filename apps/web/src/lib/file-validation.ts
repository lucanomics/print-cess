import { MAX_PDF_PAGES, MAX_PLAINTEXT_BYTES, type FileKind } from "@print-cess/protocol";

export type ValidatedMobileFile = {
  bytes: Uint8Array;
  fileKind: FileKind;
  pageCount: number;
  width?: number;
  height?: number;
};

export type FileValidationCode =
  "unsupportedType" | "tooLarge" | "tooManyPages" | "lockedPdf" | "damagedFile";

const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const ACTIVE_PDF_MARKERS = ["/JavaScript", "/OpenAction", "/Launch", "/EmbeddedFile", "/AA"];

// Current phone cameras reach 48 MP, and a phone panorama is routinely longer
// than 12,000 pixels on one edge, so the previous budget rejected ordinary
// gallery photographs. These bounds admit real camera output; the ratio below
// is what actually keeps a decompression bomb out.
const MAX_IMAGE_EDGE = 30_000;
const MAX_IMAGE_PIXELS = 100_000_000;

// A real file carries far more than one compressed byte for every few thousand
// pixels; a bomb is the inverse, declaring enormous dimensions from a tiny
// file. The ratio is deliberately generous — a sparse 600 dpi scan of a mostly
// blank page is legitimate and compresses extremely well — because the absolute
// ceiling above is what bounds memory, and rejecting a visitor's real document
// is the more likely harm here.
const MIN_PIXELS_PER_COMPRESSED_BYTE = 2048;

// Decoding at native size is the strongest check available on the phone, but a
// 100 MP bitmap can exhaust a modest device. Above this size the header parse,
// the ratio gate, and the kiosk's own validation carry the check instead.
const MAX_VERIFIED_DECODE_PIXELS = 40_000_000;

export class FileValidationError extends Error {
  public constructor(public readonly code: FileValidationCode) {
    super(code);
    this.name = "FileValidationError";
  }
}

export function detectFileKind(bytes: Uint8Array): FileKind {
  if (bytes.byteLength >= 5 && new TextDecoder("ascii").decode(bytes.subarray(0, 5)) === "%PDF-")
    return "pdf";
  if (bytes.byteLength >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    return "jpeg";
  if (
    bytes.byteLength >= PNG_SIGNATURE.length &&
    fixedBytesEqual(bytes.subarray(0, 8), PNG_SIGNATURE)
  )
    return "png";
  throw new FileValidationError("unsupportedType");
}

export async function validateFileForMobile(file: File): Promise<ValidatedMobileFile> {
  if (file.size < 1) throw new FileValidationError("damagedFile");
  if (file.size > MAX_PLAINTEXT_BYTES) throw new FileValidationError("tooLarge");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const fileKind = detectFileKind(bytes);
  if (fileKind === "pdf") return { bytes, fileKind, pageCount: await validatePdf(bytes) };
  const dimensions = fileKind === "png" ? parsePngDimensions(bytes) : parseJpegDimensions(bytes);
  validateDimensions(dimensions.width, dimensions.height, bytes.byteLength);
  await verifyBrowserImageDecode(file, dimensions);
  return { bytes, fileKind, pageCount: 1, ...dimensions };
}

export async function validatePdf(bytes: Uint8Array): Promise<number> {
  const searchable = new TextDecoder("latin1").decode(bytes);
  // PDF names may hex-escape any character, so `/J#61vaScript` names the same
  // key as `/JavaScript`. Scan the decoded form too, or the marker check below
  // is bypassed by an author who only has to escape one letter.
  const decodedNames = decodePdfNameEscapes(searchable);
  if (searchable.includes("/Encrypt") || decodedNames.includes("/Encrypt"))
    throw new FileValidationError("lockedPdf");
  if (
    ACTIVE_PDF_MARKERS.some(
      (marker) => searchable.includes(marker) || decodedNames.includes(marker),
    )
  )
    throw new FileValidationError("damagedFile");
  try {
    const pdfjs = await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
    const task = pdfjs.getDocument({
      data: bytes.slice(),
      stopAtErrors: true,
      enableXfa: false,
      maxImageSize: MAX_IMAGE_PIXELS,
      canvasMaxAreaInBytes: 64 * 1024 * 1024,
      disableAutoFetch: true,
      disableStream: true,
    });
    let passwordRequested = false;
    task.onPassword = () => {
      passwordRequested = true;
      void task.destroy();
    };
    const document = await task.promise;
    try {
      if (passwordRequested) throw new FileValidationError("lockedPdf");
      if (document.numPages > MAX_PDF_PAGES) throw new FileValidationError("tooManyPages");
      if (document.numPages < 1) throw new FileValidationError("damagedFile");
      return document.numPages;
    } finally {
      await document.cleanup();
      await task.destroy();
    }
  } catch (error) {
    if (error instanceof FileValidationError) throw error;
    if (String(error).toLowerCase().includes("password"))
      throw new FileValidationError("lockedPdf");
    throw new FileValidationError("damagedFile");
  }
}

export function parsePngDimensions(bytes: Uint8Array): { width: number; height: number } {
  if (bytes.byteLength < 24 || !fixedBytesEqual(bytes.subarray(0, 8), PNG_SIGNATURE))
    throw new FileValidationError("damagedFile");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16, false), height: view.getUint32(20, false) };
}

export function parseJpegDimensions(bytes: Uint8Array): { width: number; height: number } {
  if (bytes.byteLength < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8)
    throw new FileValidationError("damagedFile");
  let offset = 2;
  while (offset + 4 <= bytes.byteLength) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = bytes[offset + 1] ?? 0;
    offset += 2;
    if (marker === 0xd9 || marker === 0xda) break;
    const length = ((bytes[offset] ?? 0) << 8) | (bytes[offset + 1] ?? 0);
    if (length < 2 || offset + length > bytes.byteLength)
      throw new FileValidationError("damagedFile");
    if (isStartOfFrame(marker)) {
      return {
        height: ((bytes[offset + 3] ?? 0) << 8) | (bytes[offset + 4] ?? 0),
        width: ((bytes[offset + 5] ?? 0) << 8) | (bytes[offset + 6] ?? 0),
      };
    }
    offset += length;
  }
  throw new FileValidationError("damagedFile");
}

export function validateDimensions(width: number, height: number, compressedBytes: number): void {
  if (
    width < 1 ||
    height < 1 ||
    width > MAX_IMAGE_EDGE ||
    height > MAX_IMAGE_EDGE ||
    width * height > MAX_IMAGE_PIXELS ||
    width * height > compressedBytes * MIN_PIXELS_PER_COMPRESSED_BYTE
  ) {
    throw new FileValidationError("damagedFile");
  }
}

export function decodedDimensionsMatch(
  expected: { width: number; height: number },
  decoded: { width: number; height: number },
): boolean {
  if (decoded.width === expected.width && decoded.height === expected.height) return true;
  // Browsers disagree about whether `createImageBitmap` applies the EXIF
  // orientation tag, and the `imageOrientation: "none"` request below is
  // ignored by some of them. A photo held sideways — which is most photos in a
  // phone gallery — then decodes with its axes swapped relative to the width
  // and height stored in the file. That is a valid, printable photograph, not a
  // damaged one, so accept the quarter-turn form as well.
  return decoded.width === expected.height && decoded.height === expected.width;
}

async function verifyBrowserImageDecode(
  file: File,
  expected: { width: number; height: number },
): Promise<void> {
  if (typeof createImageBitmap !== "function") return;
  if (expected.width * expected.height > MAX_VERIFIED_DECODE_PIXELS) return;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "none" });
    try {
      if (!decodedDimensionsMatch(expected, bitmap)) throw new FileValidationError("damagedFile");
    } finally {
      bitmap.close();
    }
  } catch (error) {
    if (error instanceof FileValidationError) throw error;
    throw new FileValidationError("damagedFile");
  }
}

function decodePdfNameEscapes(source: string): string {
  if (!source.includes("#")) return source;
  return source.replaceAll(/#([0-9a-fA-F]{2})/gu, (match, hex: string) => {
    const code = Number.parseInt(hex, 16);
    // `#00` is not a legal name character, so leave the sequence untouched
    // rather than inventing a NUL that the real parser would reject.
    return code === 0 ? match : String.fromCharCode(code);
  });
}

function isStartOfFrame(marker: number): boolean {
  return (
    (marker >= 0xc0 && marker <= 0xc3) ||
    (marker >= 0xc5 && marker <= 0xc7) ||
    (marker >= 0xc9 && marker <= 0xcb) ||
    (marker >= 0xcd && marker <= 0xcf)
  );
}

function fixedBytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false;
  let difference = 0;
  for (let index = 0; index < left.byteLength; index += 1)
    difference |= left[index]! ^ right[index]!;
  return difference === 0;
}
