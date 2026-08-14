import { describe, expect, it } from "vitest";

import { buildDropLink, parseDropFragment } from "./drop-link";

const CODE = "23456789ABCD";

describe("buildDropLink", () => {
  it("keeps the transfer code in the fragment, where no server can see it", () => {
    const link = buildDropLink("https://print-cess.example", CODE);
    expect(link).toBe(`https://print-cess.example/receive#c=${CODE}`);
    const url = new URL(link);
    expect(url.pathname).toBe("/receive");
    expect(url.search).toBe("");
  });
});

describe("parseDropFragment", () => {
  it("reads the code a scanned QR link carries", () => {
    expect(parseDropFragment(`#c=${CODE}`)).toBe(CODE);
  });

  it("accepts a bare fragment for a hand-edited link", () => {
    expect(parseDropFragment(`#${CODE}`)).toBe(CODE);
  });

  it("normalizes the letters a person is likely to mistype", () => {
    expect(parseDropFragment("#c=2345-6789-abcd")).toBe(CODE);
  });

  it("returns nothing for a missing, partial, or malformed fragment", () => {
    expect(parseDropFragment("")).toBeNull();
    expect(parseDropFragment("#")).toBeNull();
    expect(parseDropFragment("#c=2345")).toBeNull();
    expect(parseDropFragment("#c=23456789ABCDEF")).toBeNull();
    expect(parseDropFragment("#other=1")).toBeNull();
  });
});
