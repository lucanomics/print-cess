import { describe, expect, it } from "vitest";

import {
  MAX_PLAINTEXT_BYTES,
  MAX_PRINT_BUNDLE_FILES,
  PrintBundleError,
  encodePrintBundle,
  parsePrintBundle,
  printBundleEncodedSize,
} from "../src/index.js";

describe("print bundle", () => {
  it("round-trips mixed printable file kinds without filenames", () => {
    const encoded = encodePrintBundle([
      { fileKind: "jpeg", bytes: new Uint8Array([0xff, 0xd8, 0xff, 1]) },
      { fileKind: "pdf", bytes: new TextEncoder().encode("%PDF-test") },
      { fileKind: "hwpx", bytes: new Uint8Array([1, 2, 3, 4]) },
    ]);

    const parsed = parsePrintBundle(encoded);
    expect(parsed.map((item) => item.fileKind)).toEqual(["jpeg", "pdf", "hwpx"]);
    expect(parsed.map((item) => [...item.bytes])).toEqual([
      [0xff, 0xd8, 0xff, 1],
      [...new TextEncoder().encode("%PDF-test")],
      [1, 2, 3, 4],
    ]);
    expect(printBundleEncodedSize(parsed)).toBe(encoded.byteLength);
  });

  it("rejects nested bundles, invalid counts, truncation, and trailing data", () => {
    expect(() => encodePrintBundle([])).toThrow(PrintBundleError);
    expect(() =>
      encodePrintBundle(
        Array.from({ length: MAX_PRINT_BUNDLE_FILES + 1 }, () => ({
          fileKind: "png" as const,
          bytes: new Uint8Array([1]),
        })),
      ),
    ).toThrow(PrintBundleError);

    const valid = encodePrintBundle([
      { fileKind: "png", bytes: new Uint8Array([1, 2]) },
      { fileKind: "pdf", bytes: new Uint8Array([3, 4]) },
    ]);
    expect(() => parsePrintBundle(valid.slice(0, -1))).toThrow(PrintBundleError);
    const trailing = new Uint8Array(valid.byteLength + 1);
    trailing.set(valid);
    expect(() => parsePrintBundle(trailing)).toThrow(PrintBundleError);
  });

  it("keeps every inner document within the existing 10 MiB document ceiling", () => {
    expect(() =>
      encodePrintBundle([{ fileKind: "pdf", bytes: new Uint8Array(MAX_PLAINTEXT_BYTES + 1) }]),
    ).toThrow(PrintBundleError);
  });
});
