import { afterEach, describe, expect, it, vi } from "vitest";

import { uploadCiphertext } from "./api-client";

describe("uploadCiphertext", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("accepts a successful private Vercel Blob response without an ETag", async () => {
    const fetch = vi.fn().mockResolvedValue(
      Response.json({
        contentDisposition: 'attachment; filename="encrypted.bin"',
        contentType: "application/octet-stream",
        pathname: "v1/session/encrypted.bin",
        size: 4,
        uploadedAt: "2026-08-03T00:00:00.000Z",
        url: "https://blob.example/encrypted.bin",
      }),
    );
    vi.stubGlobal("fetch", fetch);

    await expect(
      uploadCiphertext(
        {
          url: "https://vercel.com/api/blob/presigned",
          headers: { "Content-Type": "application/octet-stream" },
        },
        new Uint8Array([1, 2, 3, 4]),
      ),
    ).resolves.toEqual({ size: 4 });
  });
});
