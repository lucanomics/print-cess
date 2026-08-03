import { describe, expect, it } from "vitest";

import { normalizeEntityTag } from "./entity-tag";

describe("normalizeEntityTag", () => {
  it.each([
    ['"blob-tag"', "blob-tag"],
    ['W/"blob-tag"', "blob-tag"],
    ["blob-tag", "blob-tag"],
  ])("normalizes %s", (input, expected) => {
    expect(normalizeEntityTag(input)).toBe(expected);
  });

  it.each([undefined, null, "", "  "])("rejects an empty tag", (input) => {
    expect(normalizeEntityTag(input)).toBeUndefined();
  });
});
