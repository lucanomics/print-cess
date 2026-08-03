import { describe, expect, it } from "vitest";

import { buildContentSecurityPolicy } from "./proxy";

describe("Content Security Policy", () => {
  it("allows the exact Vercel private Blob signing endpoint", () => {
    const policy = buildContentSecurityPolicy("test-nonce", false);

    expect(policy).toContain(
      "connect-src 'self' https://vercel.com https://*.blob.vercel-storage.com https://blob.vercel-storage.com",
    );
    expect(policy).toContain("frame-src 'self' blob:");
    expect(policy).not.toContain("https://*.vercel.com");
  });
});
