import { describe, expect, it } from "vitest";

import { parseSessionFragment } from "./session-fragment";

describe("QR fragment", () => {
  it("accepts only canonical fixed-size values", () => {
    const token = "A".repeat(43);
    expect(parseSessionFragment(`#t=${token}&fp=${token}`)).toEqual({
      uploadToken: token,
      fingerprint: token,
      supportsHwpx: false,
      supportsHwp: false,
    });
    // HWPX support must not imply legacy HWP support. A kiosk that advertises
    // only the newer format is offered only the newer format.
    expect(parseSessionFragment(`#t=${token}&fp=${token}&hwpx=1`)).toEqual({
      uploadToken: token,
      fingerprint: token,
      supportsHwpx: true,
      supportsHwp: false,
    });
    expect(parseSessionFragment(`#t=${token}&fp=${token}&hwpx=1&hwp=1`)).toEqual({
      uploadToken: token,
      fingerprint: token,
      supportsHwpx: true,
      supportsHwp: true,
    });
    expect(parseSessionFragment(`#t=${token}&fp=${token}&hwp=1`)).toEqual({
      uploadToken: token,
      fingerprint: token,
      supportsHwpx: false,
      supportsHwp: true,
    });
    expect(parseSessionFragment(`?t=${token}&fp=${token}`)).toBeNull();
    expect(parseSessionFragment("#t=short&fp=short")).toBeNull();
    const nonCanonical = `${"A".repeat(42)}B`;
    expect(parseSessionFragment(`#t=${nonCanonical}&fp=${token}`)).toBeNull();
  });
});
