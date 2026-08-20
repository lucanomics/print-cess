import { describe, expect, it } from "vitest";

import {
  MAX_PRINT_BUNDLE_FILES,
  PrintBundleError,
  decodePrintBundle,
  encodePrintBundle,
} from "../src/index.js";

describe("print bundle", () => {
  it("round-trips mixed printable document kinds in order", () => {
    const bundle = encodePrintBundle([
      { fileKind: "jpeg", bytes: new Uint8Array([1, 2, 3]) },
      { fileKind: "pdf", bytes: new Uint8Array([4, 5]) },
      { fileKind: "hwpx", bytes: new Uint8Array([6, 7, 8, 9]) },
    ]);

    expect(decodePrintBundle(bundle)).toEqual([
      { fileKind: "jpeg", bytes: new Uint8Array([1, 2, 3]) },
      { fileKind: "pdf", bytes: new Uint8Array([4, 5]) },
      { fileKind: "hwpx", bytes: new Uint8Array([6, 7, 8, 9]) },
    ]);
  });

  it("rejects a truncated bundle instead of returning a partial print set", () => {
    const bundle = encodePrintBundle([{ fileKind: "png", bytes: new Uint8Array([1, 2, 3]) }]);
    expect(() => decodePrintBundle(bundle.subarray(0, bundle.byteLength - 1))).toThrow(
      PrintBundleError,
    );
  });

  it("rejects more than the bounded file count", () => {
    expect(() =>
      encodePrintBundle(
        Array.from({ length: MAX_PRINT_BUNDLE_FILES + 1 }, () => ({
          fileKind: "pdf" as const,
          bytes: new Uint8Array([1]),
        })),
      ),
    ).toThrow(PrintBundleError);
  });

  it("rejects trailing bytes so the authenticated plaintext is canonical", () => {
    const bundle = encodePrintBundle([{ fileKind: "hwp", bytes: new Uint8Array([1]) }]);
    const changed = new Uint8Array(bundle.byteLength + 1);
    changed.set(bundle);
    expect(() => decodePrintBundle(changed)).toThrow(PrintBundleError);
  });
});
