import { describe, expect, it } from "vitest";

import { parseSessionFragment } from "./session-fragment";

describe("QR fragment", () => {
  it("accepts only canonical fixed-size values and independent capabilities", () => {
    const token = "A".repeat(43);
    expect(parseSessionFragment(`#t=${token}&fp=${token}`)).toEqual({
      uploadToken: token,
      fingerprint: token,
      supportsHwpx: false,
      supportsHwp: false,
      supportsBundle: false,
    });
    expect(parseSessionFragment(`#t=${token}&fp=${token}&hwpx=1`)).toEqual({
      uploadToken: token,
      fingerprint: token,
      supportsHwpx: true,
      supportsHwp: false,
      supportsBundle: false,
    });
    expect(parseSessionFragment(`#t=${token}&fp=${token}&hwpx=1&hwp=1&bundle=1`)).toEqual({
      uploadToken: token,
      fingerprint: token,
      supportsHwpx: true,
      supportsHwp: true,
      supportsBundle: true,
    });
    expect(parseSessionFragment(`#t=${token}&fp=${token}&hwp=1&bundle=1`)).toEqual({
      uploadToken: token,
      fingerprint: token,
      supportsHwpx: false,
      supportsHwp: true,
      supportsBundle: true,
    });
    expect(parseSessionFragment(`?t=${token}&fp=${token}`)).toBeNull();
    expect(parseSessionFragment("#t=short&fp=short")).toBeNull();
    const nonCanonical = `${"A".repeat(42)}B`;
    expect(parseSessionFragment(`#t=${nonCanonical}&fp=${token}`)).toBeNull();
  });
});
