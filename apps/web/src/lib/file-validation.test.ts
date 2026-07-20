import { describe, expect, it } from "vitest";

import { FileValidationError, detectFileKind, parsePngDimensions } from "./file-validation";

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
});
