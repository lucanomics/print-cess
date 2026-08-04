import { describe, expect, it } from "vitest";

import {
  FileValidationError,
  classifySelectedFile,
  detectFileKind,
  parsePngDimensions,
  validateFileForMobile,
} from "./file-validation";

describe("file validation", () => {
  it("detects signatures instead of trusting filenames", () => {
    expect(detectFileKind(new TextEncoder().encode("%PDF-1.7\n"))).toBe("pdf");
    expect(detectFileKind(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("jpeg");
    expect(() => detectFileKind(new TextEncoder().encode("MZ pretend.pdf"))).toThrow(
      FileValidationError,
    );
  });

  it("classifies common phone images for local normalization", () => {
    expect(classifySelectedFile({ name: "photo.HEIC", type: "image/heic" })).toBe("image");
    expect(classifySelectedFile({ name: "scan.webp", type: "image/webp" })).toBe("image");
    expect(classifySelectedFile({ name: "legacy.tiff", type: "" })).toBe("image");
    expect(classifySelectedFile({ name: "unsafe.svg", type: "image/svg+xml" })).toBe("unknown");
  });

  it("routes office and Hangul documents to the PDF guidance", () => {
    expect(classifySelectedFile({ name: "application.hwp", type: "application/x-hwp" })).toBe(
      "document",
    );
    expect(
      classifySelectedFile({
        name: "form.docx",
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      }),
    ).toBe("document");
    expect(classifySelectedFile({ name: "table.xlsx", type: "application/vnd.ms-excel" })).toBe(
      "document",
    );
  });

  it("accepts canonical HWPX only for a capable kiosk", async () => {
    const mime = new TextEncoder().encode("application/hwp+zip");
    const bytes = new Uint8Array(30 + 8 + mime.length);
    const view = new DataView(bytes.buffer);
    view.setUint32(0, 0x04034b50, true);
    view.setUint16(8, 0, true);
    view.setUint32(18, mime.length, true);
    view.setUint32(22, mime.length, true);
    view.setUint16(26, 8, true);
    bytes.set(new TextEncoder().encode("mimetype"), 30);
    bytes.set(mime, 38);
    const file = new File([bytes], "application.hwpx", { type: "application/hwp+zip" });

    await expect(validateFileForMobile(file)).rejects.toMatchObject({ code: "hwpxUnavailable" });
    await expect(validateFileForMobile(file, { allowHwpx: true })).resolves.toMatchObject({
      fileKind: "hwpx",
      normalized: false,
    });
  });

  it("parses PNG dimensions from IHDR", () => {
    const bytes = new Uint8Array(24);
    bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
    const view = new DataView(bytes.buffer);
    view.setUint32(16, 1170, false);
    view.setUint32(20, 1654, false);
    expect(parsePngDimensions(bytes)).toEqual({ width: 1170, height: 1654 });
  });
});
