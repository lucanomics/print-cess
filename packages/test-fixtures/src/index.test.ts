import { describe, expect, it } from "vitest";

import { TEN_MIB, createBoundaryBytes, createSyntheticPdf } from "./index.js";

describe("synthetic fixture builders", () => {
  it("creates the exact binary boundary", () => {
    expect(createBoundaryBytes()).toHaveLength(TEN_MIB);
    expect(createBoundaryBytes(1)).toHaveLength(TEN_MIB + 1);
  });

  it("marks generated PDFs as synthetic", async () => {
    const pdf = await createSyntheticPdf(1);
    expect(new TextDecoder("latin1").decode(pdf.slice(0, 8))).toContain("%PDF-");
  });
});
