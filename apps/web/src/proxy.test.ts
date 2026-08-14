import { describe, expect, it } from "vitest";

import { blobConnectOrigins, buildContentSecurityPolicy } from "./proxy";

/** `ProcessEnv` demands NODE_ENV, which none of these cases depend on. */
function env(values: Record<string, string> = {}): NodeJS.ProcessEnv {
  return values as NodeJS.ProcessEnv;
}

describe("Content Security Policy", () => {
  it("allows the exact Vercel private Blob signing endpoint", () => {
    const policy = buildContentSecurityPolicy("test-nonce", false, env());

    expect(policy).toContain(
      "connect-src 'self' https://vercel.com https://*.blob.vercel-storage.com https://blob.vercel-storage.com",
    );
    expect(policy).toContain("frame-src 'self' blob:");
    expect(policy).not.toContain("https://*.vercel.com");
  });

  it("admits the configured S3 endpoint so the browser can reach it", () => {
    // The phone PUTs and GETs ciphertext directly. Without its origin here the
    // S3 provider is selectable but unusable from a browser.
    const origins = blobConnectOrigins(
      env({
        PRINT_CESS_BLOB_PROVIDER: "railway-s3",
        S3_ENDPOINT: "https://storage.example.test",
        S3_BUCKET: "print-cess",
      }),
    );

    expect(origins).toEqual([
      "https://storage.example.test",
      "https://print-cess.storage.example.test",
    ]);
  });

  it("drops the virtual-hosted form when the bucket forces path style", () => {
    const origins = blobConnectOrigins(
      env({
        PRINT_CESS_BLOB_PROVIDER: "railway-s3",
        S3_ENDPOINT: "https://storage.example.test",
        S3_BUCKET: "print-cess",
        S3_FORCE_PATH_STYLE: "true",
      }),
    );

    expect(origins).toEqual(["https://storage.example.test"]);
  });

  it("never widens the policy for a missing, plaintext, or malformed endpoint", () => {
    for (const endpoint of [undefined, "http://storage.example.test", "not-a-url"]) {
      const origins = blobConnectOrigins(
        env({
          PRINT_CESS_BLOB_PROVIDER: "railway-s3",
          ...(endpoint ? { S3_ENDPOINT: endpoint } : {}),
        }),
      );
      expect(origins).toEqual([]);
    }
  });

  it("keeps a path or query out of the admitted origin", () => {
    const origins = blobConnectOrigins(
      env({
        PRINT_CESS_BLOB_PROVIDER: "railway-s3",
        S3_ENDPOINT: "https://storage.example.test/bucket?token=secret",
      }),
    );

    expect(origins).toEqual(["https://storage.example.test"]);
  });

  it("does not admit S3 when the Vercel provider is selected", () => {
    const policy = buildContentSecurityPolicy(
      "test-nonce",
      false,
      env({ S3_ENDPOINT: "https://storage.example.test" }),
    );

    expect(policy).not.toContain("storage.example.test");
  });
});
