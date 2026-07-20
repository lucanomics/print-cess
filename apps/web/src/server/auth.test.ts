import { describe, expect, it } from "vitest";

import { secretMatches } from "./auth";

describe("secretMatches", () => {
  it("matches configured secrets without accepting missing or different values", () => {
    expect(secretMatches("configured-secret", "configured-secret")).toBe(true);
    expect(secretMatches("different-secret", "configured-secret")).toBe(false);
    expect(secretMatches(null, "configured-secret")).toBe(false);
    expect(secretMatches("configured-secret", undefined)).toBe(false);
  });
});
