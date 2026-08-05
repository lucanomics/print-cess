import { describe, expect, it } from "vitest";

import {
  FileValidationError,
  decodedDimensionsMatch,
  detectFileKind,
  parsePngDimensions,
  validateDimensions,
  validatePdf,
} from "./file-validation";

describe("file validation", () => {
  it("detects signatures instead of trusting filenames", () => {
    expect(detectFileKind(new TextEncoder().encode("%PDF-1.7\n"))).toBe("pdf");
    expect(() => detectFileKind(new TextEncoder().encode("MZ pretend.pdf"))).toThrow(
      FileValidationError,
    );
  });

  it("parses PNG dimensions from IHDR", () => {
    const bytes = new Uint8Array(24);
    bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
    const view = new DataView(bytes.buffer);
    view.setUint32(16, 1170, false);
    view.setUint32(20, 1654, false);
    expect(parsePngDimensions(bytes)).toEqual({ width: 1170, height: 1654 });
  });

  it("rejects active PDF content that hex-escapes its name", async () => {
    const plain = new TextEncoder().encode("%PDF-1.7\n1 0 obj<</OpenAction 2 0 R>>endobj\n");
    await expect(validatePdf(plain)).rejects.toThrow(
      expect.objectContaining({ code: "damagedFile" }),
    );

    // `/#4fpenAction` is the same PDF name, written to slip past a substring scan.
    const escaped = new TextEncoder().encode("%PDF-1.7\n1 0 obj<</#4fpenAction 2 0 R>>endobj\n");
    await expect(validatePdf(escaped)).rejects.toThrow(
      expect.objectContaining({ code: "damagedFile" }),
    );
  });

  it("reports an encrypted PDF even when /Encrypt is hex-escaped", async () => {
    const escaped = new TextEncoder().encode("%PDF-1.7\ntrailer<</#45ncrypt 9 0 R>>\n");
    await expect(validatePdf(escaped)).rejects.toThrow(
      expect.objectContaining({ code: "lockedPdf" }),
    );
  });

  it("accepts a photo whose decoded axes are swapped by its EXIF orientation", () => {
    // A phone photo held sideways: 4032x3024 in the file, decoded as 3024x4032.
    const stored = { width: 4032, height: 3024 };
    expect(decodedDimensionsMatch(stored, { width: 3024, height: 4032 })).toBe(true);
    expect(decodedDimensionsMatch(stored, stored)).toBe(true);
    expect(decodedDimensionsMatch(stored, { width: 1024, height: 768 })).toBe(false);
  });

  it("accepts the output of a current phone camera", () => {
    // 48 MP still, ~7 MB, and a 14,000-pixel-wide phone panorama: both were
    // rejected as damaged by the previous 12,000-edge / 40 MP budget.
    expect(() => validateDimensions(8064, 6048, 7 * 1024 * 1024)).not.toThrow();
    expect(() => validateDimensions(14_000, 3_000, 4 * 1024 * 1024)).not.toThrow();
  });

  it("still rejects dimensions a tiny file could not really contain", () => {
    // 40 MP declared by 8 KB: a decompression bomb, not a photograph.
    expect(() => validateDimensions(8000, 5000, 8 * 1024)).toThrow(
      expect.objectContaining({ code: "damagedFile" }),
    );
    expect(() => validateDimensions(40_000, 40_000, 9 * 1024 * 1024)).toThrow(
      expect.objectContaining({ code: "damagedFile" }),
    );
    expect(() => validateDimensions(0, 100, 1024)).toThrow(FileValidationError);
  });
});
