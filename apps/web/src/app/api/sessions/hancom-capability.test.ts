import { describe, expect, it } from "vitest";

import { parseSessionFragment } from "@/lib/session-fragment";

function buildFragment(input: {
  supportsHwpx: boolean;
  supportsHwp: boolean;
  supportsBundle: boolean;
}): string {
  const token = "A".repeat(43);
  const capability = `${input.supportsHwpx ? "&hwpx=1" : ""}${input.supportsHwp ? "&hwp=1" : ""}${input.supportsBundle ? "&bundle=1" : ""}`;
  return `#t=${token}&fp=${token}${capability}`;
}

describe("kiosk document capability round trip", () => {
  it.each([
    { supportsHwpx: false, supportsHwp: false, supportsBundle: false },
    { supportsHwpx: true, supportsHwp: false, supportsBundle: true },
    { supportsHwpx: false, supportsHwp: true, supportsBundle: true },
    { supportsHwpx: true, supportsHwp: true, supportsBundle: true },
  ])("carries %o unchanged to the phone", (declared) => {
    const parsed = parseSessionFragment(buildFragment(declared));
    expect(parsed).toMatchObject(declared);
  });

  it("never infers a capability the kiosk withheld", () => {
    const hwpxOnly = parseSessionFragment(
      buildFragment({ supportsHwpx: true, supportsHwp: false, supportsBundle: false }),
    );
    expect(hwpxOnly?.supportsHwp).toBe(false);
    expect(hwpxOnly?.supportsBundle).toBe(false);

    const bundleOnly = parseSessionFragment(
      buildFragment({ supportsHwpx: false, supportsHwp: false, supportsBundle: true }),
    );
    expect(bundleOnly?.supportsHwpx).toBe(false);
    expect(bundleOnly?.supportsHwp).toBe(false);
    expect(bundleOnly?.supportsBundle).toBe(true);
  });
});
