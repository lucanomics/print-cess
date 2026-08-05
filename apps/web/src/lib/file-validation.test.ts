import { describe, expect, it } from "vitest";

import {
  FileValidationError,
  detectFileKind,
  parsePngDimensions,
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
});
