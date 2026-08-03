import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  head: vi.fn(),
  issueSignedToken: vi.fn(),
  presignUrl: vi.fn(),
}));

vi.mock("@vercel/blob", () => ({
  BlobNotFoundError: class extends Error {},
  head: mocks.head,
  issueSignedToken: mocks.issueSignedToken,
  presignUrl: mocks.presignUrl,
}));

import { VercelBlobTransport } from "./vercel";

const PATHNAME = `v1/${"A".repeat(22)}.bin`;

describe("VercelBlobTransport metadata", () => {
  beforeEach(() => {
    mocks.head.mockReset();
  });

  it("reads the provider-authoritative size and ETag through the Blob SDK", async () => {
    mocks.head.mockResolvedValue({ size: 512, etag: "provider-etag" });

    await expect(new VercelBlobTransport().head(PATHNAME)).resolves.toEqual({
      size: 512,
      etag: "provider-etag",
    });
    expect(mocks.head).toHaveBeenCalledWith(PATHNAME, {
      abortSignal: expect.any(AbortSignal),
    });
  });

  it("rejects incomplete provider metadata", async () => {
    mocks.head.mockResolvedValue({ size: 512, etag: "" });

    await expect(new VercelBlobTransport().head(PATHNAME)).rejects.toMatchObject({ status: 503 });
  });

  it("redacts provider failures", async () => {
    mocks.head.mockRejectedValue(new Error("token leaked by provider"));

    await expect(new VercelBlobTransport().head(PATHNAME)).rejects.toMatchObject({
      status: 503,
      message: "Blob metadata lookup failed.",
    });
  });
});
