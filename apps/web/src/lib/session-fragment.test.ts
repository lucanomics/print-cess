import { describe, expect, it } from "vitest";

import { parseSessionFragment } from "./session-fragment";

describe("QR fragment", () => {
  it("accepts only canonical fixed-size values", () => {
    const token = "A".repeat(43);
    expect(parseSessionFragment(`#t=${token}&fp=${token}`)).toEqual({
      uploadToken: token,
      fingerprint: token,
    });
    expect(parseSessionFragment(`?t=${token}&fp=${token}`)).toBeNull();
    expect(parseSessionFragment("#t=short&fp=short")).toBeNull();
    const nonCanonical = `${"A".repeat(42)}B`;
    expect(parseSessionFragment(`#t=${nonCanonical}&fp=${token}`)).toBeNull();
  });
});
