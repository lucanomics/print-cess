import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { generateToken } from "@print-cess/crypto";

import { LocalEncryptedBlobTransport } from "@/server/blob/local";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("LocalEncryptedBlobTransport", () => {
  it("rejects an equal-length non-canonical blob pathname", async () => {
    const root = await mkdtemp(join(tmpdir(), "print-cess-test-"));
    directories.push(root);
    const transport = new LocalEncryptedBlobTransport("http://localhost:3000", root);

    await expect(
      transport.authorizeUpload(`v1/${"A".repeat(21)}B.bin`, Date.now() + 30_000, 512),
    ).rejects.toMatchObject({ code: "bad_request", status: 400 });
  });

  it("purges ciphertext that became unreachable after a process restart", async () => {
    const root = await mkdtemp(join(tmpdir(), "print-cess-test-"));
    directories.push(root);
    const stale = join(root, "v1_stale.bin");
    await writeFile(stale, new Uint8Array([1, 2, 3]));

    const transport = new LocalEncryptedBlobTransport("http://localhost:3000", root);
    await transport.authorizeUpload(`v1/${generateToken(16)}.bin`, Date.now() + 30_000, 512);

    await expect(stat(stale)).rejects.toThrow();
  });

  it("scopes signed operations to one path, operation, and expiry", async () => {
    const root = await mkdtemp(join(tmpdir(), "print-cess-test-"));
    directories.push(root);
    const transport = new LocalEncryptedBlobTransport("http://localhost:3000", root);
    const pathname = `v1/${generateToken(16)}.bin`;
    const upload = await transport.authorizeUpload(pathname, Date.now() + 30_000, 512);
    const token = new URL(upload.url).searchParams.get("t")!;
    const payload = new Uint8Array(200).fill(7);
    const metadata = await transport.put(
      new Request(upload.url, {
        method: "PUT",
        headers: {
          "Content-Type": "application/octet-stream",
          "Content-Length": String(payload.length),
        },
        body: payload,
      }),
      token,
    );
    expect(metadata.size).toBe(payload.length);
    await expect(
      transport.put(
        new Request(upload.url, {
          method: "PUT",
          headers: {
            "Content-Type": "application/octet-stream",
            "Content-Length": String(payload.length),
          },
          body: payload,
        }),
        token,
      ),
    ).rejects.toThrow();
    const download = await transport.authorizeDownload(pathname, Date.now() + 30_000);
    const result = await transport.get(new URL(download.url).searchParams.get("t")!);
    expect(result.bytes).toEqual(payload);
    await transport.delete(pathname, metadata.etag);
    await transport.delete(pathname, metadata.etag);
  });
});
