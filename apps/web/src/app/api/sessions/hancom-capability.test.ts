import { describe, expect, it } from "vitest";

import { parseSessionFragment } from "@/lib/session-fragment";

/**
 * The QR fragment is the only place a kiosk's document capabilities reach the
 * phone. Two compensating defects used to cancel each other out here: the
 * Windows kiosk never sent `supportsHwp`, and the fragment inferred it from
 * `supportsHwpx`. Either one "fixed" alone silently broke legacy HWP printing,
 * so the round trip is pinned rather than each half in isolation.
 */
function buildFragment(input: { supportsHwpx: boolean; supportsHwp: boolean }): string {
  const token = "A".repeat(43);
  // Mirrors the expression in `api/sessions/route.ts`.
  const capability = `${input.supportsHwpx ? "&hwpx=1" : ""}${input.supportsHwp ? "&hwp=1" : ""}`;
  return `#t=${token}&fp=${token}${capability}`;
}

describe("kiosk document capability round trip", () => {
  it.each([
    { supportsHwpx: false, supportsHwp: false },
    { supportsHwpx: true, supportsHwp: false },
    { supportsHwpx: false, supportsHwp: true },
    { supportsHwpx: true, supportsHwp: true },
  ])("carries %o unchanged to the phone", (declared) => {
    const parsed = parseSessionFragment(buildFragment(declared));
    expect(parsed).toMatchObject(declared);
  });

  it("never offers a format the kiosk withheld", () => {
    const hwpxOnly = parseSessionFragment(
      buildFragment({ supportsHwpx: true, supportsHwp: false }),
    );
    expect(hwpxOnly?.supportsHwp).toBe(false);

    const hwpOnly = parseSessionFragment(buildFragment({ supportsHwpx: false, supportsHwp: true }));
    expect(hwpOnly?.supportsHwpx).toBe(false);
  });
});
