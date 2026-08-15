import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return {
    ...actual,
    after: (callback: () => void | Promise<void>) => {
      void callback();
    },
  };
});

import {
  decryptDropManifest,
  deriveDropFileKey,
  deriveDropKeys,
  encryptDropChunk,
  encryptDropManifest,
  generateDropCode,
  generateToken,
  hashToken,
  type DropKeys,
  type DropManifest,
} from "@print-cess/crypto";
import type { DropOpenView } from "@print-cess/protocol";

import { POST as createDropRoute } from "@/app/api/drops/route";
import { DELETE as deleteDropRoute, GET as dropStatusRoute } from "@/app/api/drops/[dropId]/route";
import { POST as authorizePartsRoute } from "@/app/api/drops/[dropId]/parts/route";
import { POST as commitPartsRoute } from "@/app/api/drops/[dropId]/parts/complete/route";
import { POST as sealDropRoute } from "@/app/api/drops/[dropId]/seal/route";
import { POST as openDropRoute } from "@/app/api/drops/[dropId]/open/route";
import { POST as downloadRoute } from "@/app/api/drops/[dropId]/download/route";
import { POST as receiptRoute } from "@/app/api/drops/[dropId]/receipt/route";
import { GET as blobGetRoute, PUT as blobPutRoute } from "@/app/api/dev/blob/route";

const ORIGIN = "http://localhost:3000";

type Operation = {
  index: number;
  url: string;
  headers: Record<string, string>;
};

function jsonRequest(path: string, body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`${ORIGIN}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: ORIGIN, ...headers },
    body: JSON.stringify(body),
  });
}

function params(dropId: string) {
  return { params: Promise.resolve({ dropId }) };
}

async function senderView(dropId: string, ownerToken: string): Promise<unknown> {
  const response = await dropStatusRoute(
    new Request(`${ORIGIN}/api/drops/${dropId}`, {
      headers: { Origin: ORIGIN, "x-print-cess-drop-token": ownerToken },
    }),
    params(dropId),
  );
  return response.json();
}

/** Drives the local signed-URL transport the same way a phone's fetch would. */
async function putPart(operation: Operation, ciphertext: Uint8Array): Promise<void> {
  const response = await blobPutRoute(
    new Request(operation.url, {
      method: "PUT",
      headers: { ...operation.headers, "Content-Length": String(ciphertext.byteLength) },
      body: Uint8Array.from(ciphertext).buffer,
    }),
  );
  expect(response.status).toBe(201);
}

async function getPart(operation: Operation): Promise<Uint8Array> {
  const response = await blobGetRoute(new Request(operation.url, { method: "GET" }));
  expect(response.status).toBe(200);
  return new Uint8Array(await response.arrayBuffer());
}

async function sendOneFile(
  keys: DropKeys,
  manifest: DropManifest,
  plaintext: Uint8Array,
): Promise<{ ownerToken: string; dropId: string }> {
  const ownerToken = generateToken(32);
  const created = await createDropRoute(
    jsonRequest("/api/drops", {
      protocolVersion: 1,
      dropId: keys.dropId,
      ownerTokenHash: await hashToken(ownerToken, "drop"),
      manifest: await encryptDropManifest(keys, manifest),
      fileCount: manifest.files.length,
      partCount: 1,
      totalBytes: plaintext.byteLength,
    }),
  );
  expect(created.status).toBe(201);

  const authorized = await authorizePartsRoute(
    jsonRequest(
      `/api/drops/${keys.dropId}/parts`,
      { indexes: [0] },
      { "x-print-cess-drop-token": ownerToken },
    ),
    params(keys.dropId),
  );
  expect(authorized.status).toBe(200);
  const { operations } = (await authorized.json()) as { operations: Operation[] };

  const fileKey = await deriveDropFileKey(keys, 0);
  const ciphertext = await encryptDropChunk(
    fileKey,
    keys,
    { fileIndex: 0, chunkIndex: 0, chunkCount: 1, partIndex: 0 },
    plaintext,
  );
  await putPart(operations[0]!, ciphertext);

  const committed = await commitPartsRoute(
    jsonRequest(
      `/api/drops/${keys.dropId}/parts/complete`,
      { parts: [{ index: 0, size: ciphertext.byteLength }] },
      { "x-print-cess-drop-token": ownerToken },
    ),
    params(keys.dropId),
  );
  expect(committed.status).toBe(200);

  const sealed = await sealDropRoute(
    jsonRequest(`/api/drops/${keys.dropId}/seal`, {}, { "x-print-cess-drop-token": ownerToken }),
    params(keys.dropId),
  );
  expect(sealed.status).toBe(200);
  return { ownerToken, dropId: keys.dropId };
}

let keys: DropKeys;
const plaintext = new Uint8Array([80, 97, 114, 97, 100, 105, 115, 111]);
const manifest: DropManifest = {
  protocolVersion: 1,
  files: [{ name: "note.txt", size: plaintext.byteLength, type: "text/plain", chunkCount: 1 }],
};

beforeEach(async () => {
  vi.stubEnv("PRINT_CESS_ADAPTER_MODE", "local");
  vi.stubEnv("PUBLIC_BASE_URL", ORIGIN);
  vi.stubEnv("ALLOWED_ORIGINS", ORIGIN);
  globalThis.__printCessRuntime = undefined;
  keys = await deriveDropKeys(generateDropCode());
}, 30_000);

afterEach(() => {
  vi.unstubAllEnvs();
  globalThis.__printCessRuntime = undefined;
});

describe("drop hand-off, end to end", () => {
  it("carries a file from one phone to another without the server reading it", async () => {
    await sendOneFile(keys, manifest, plaintext);

    // The receiving side starts from the transfer code alone.
    const opened = await openDropRoute(
      jsonRequest(`/api/drops/${keys.dropId}/open`, {}),
      params(keys.dropId),
    );
    expect(opened.status).toBe(200);
    const view = (await opened.json()) as DropOpenView;
    expect(view.partCount).toBe(1);

    // The file list is only readable with the code; the response carries it
    // sealed.
    expect(JSON.stringify(view)).not.toContain("note.txt");
    await expect(decryptDropManifest(keys, view.manifest, view.fileCount)).resolves.toEqual(
      manifest,
    );

    const authorized = await downloadRoute(
      jsonRequest(`/api/drops/${keys.dropId}/download`, { indexes: [0] }),
      params(keys.dropId),
    );
    expect(authorized.status).toBe(200);
    const { operations } = (await authorized.json()) as { operations: Operation[] };
    const received = await getPart(operations[0]!);
    expect(received.byteLength).toBe(plaintext.byteLength + 16);
  }, 30_000);

  it("tells the sender when the transfer has been collected", async () => {
    const { ownerToken, dropId } = await sendOneFile(keys, manifest, plaintext);

    const before = await dropStatusRoute(
      new Request(`${ORIGIN}/api/drops/${dropId}`, {
        headers: { Origin: ORIGIN, "x-print-cess-drop-token": ownerToken },
      }),
      params(dropId),
    );
    expect(await before.json()).toMatchObject({ status: "ready", receiver: "waiting" });

    // Opening a transfer is not downloading it, and downloading it is not the
    // other phone reporting that it finished. Each step is observed where it
    // actually happens, so the sending screen never claims the next one.
    await openDropRoute(jsonRequest(`/api/drops/${dropId}/open`, {}), params(dropId));
    expect(await senderView(dropId, ownerToken)).toMatchObject({
      receiver: "opened",
      openCount: 1,
      downloadCount: 0,
      deliveredCount: 0,
    });

    await downloadRoute(
      jsonRequest(`/api/drops/${dropId}/download`, { indexes: [0] }),
      params(dropId),
    );
    expect(await senderView(dropId, ownerToken)).toMatchObject({
      receiver: "downloading",
      downloadCount: 1,
      deliveredCount: 0,
    });

    const receipt = await receiptRoute(
      jsonRequest(`/api/drops/${dropId}/receipt`, {}),
      params(dropId),
    );
    expect(receipt.status).toBe(200);
    expect(await senderView(dropId, ownerToken)).toMatchObject({
      receiver: "delivered",
      deliveredCount: 1,
    });
  }, 30_000);

  it("lets a receiver who arrived early wait instead of being told the code is wrong", async () => {
    const ownerToken = generateToken(32);
    await createDropRoute(
      jsonRequest("/api/drops", {
        protocolVersion: 1,
        dropId: keys.dropId,
        ownerTokenHash: await hashToken(ownerToken, "drop"),
        manifest: await encryptDropManifest(keys, manifest),
        fileCount: 1,
        partCount: 1,
        totalBytes: plaintext.byteLength,
      }),
    );

    // The sender has created the transfer but not finished uploading it. A
    // receiver holding the right code should be asked to wait.
    const early = await openDropRoute(
      jsonRequest(`/api/drops/${keys.dropId}/open`, {}),
      params(keys.dropId),
    );
    expect(early.status).toBe(200);
    const pending = (await early.json()) as Record<string, unknown>;
    expect(pending.state).toBe("collecting");
    // Nothing about the files leaks before the transfer is sealed.
    expect(pending).not.toHaveProperty("manifest");
    expect(pending).not.toHaveProperty("partSizes");
    expect(pending).not.toHaveProperty("fileCount");
  }, 30_000);

  it("still answers a code that names nothing exactly as it always did", async () => {
    const stranger = await deriveDropKeys(generateDropCode());
    const opened = await openDropRoute(
      jsonRequest(`/api/drops/${stranger.dropId}/open`, {}),
      params(stranger.dropId),
    );
    expect(opened.status).toBe(404);
  }, 30_000);

  it("erases the ciphertext when the sender asks, leaving nothing to open", async () => {
    const { ownerToken, dropId } = await sendOneFile(keys, manifest, plaintext);

    const deleted = await deleteDropRoute(
      new Request(`${ORIGIN}/api/drops/${dropId}`, {
        method: "DELETE",
        headers: { Origin: ORIGIN, "x-print-cess-drop-token": ownerToken },
      }),
      params(dropId),
    );
    expect(deleted.status).toBe(200);

    const opened = await openDropRoute(
      jsonRequest(`/api/drops/${dropId}/open`, {}),
      params(dropId),
    );
    expect(opened.status).toBe(404);
  }, 30_000);

  it("refuses an upload that presents the wrong sender credential", async () => {
    const ownerToken = generateToken(32);
    const created = await createDropRoute(
      jsonRequest("/api/drops", {
        protocolVersion: 1,
        dropId: keys.dropId,
        ownerTokenHash: await hashToken(ownerToken, "drop"),
        manifest: await encryptDropManifest(keys, manifest),
        fileCount: 1,
        partCount: 1,
        totalBytes: plaintext.byteLength,
      }),
    );
    expect(created.status).toBe(201);

    const response = await authorizePartsRoute(
      jsonRequest(
        `/api/drops/${keys.dropId}/parts`,
        { indexes: [0] },
        { "x-print-cess-drop-token": generateToken(32) },
      ),
      params(keys.dropId),
    );
    expect(response.status).toBe(401);
  }, 30_000);

  it("refuses to hand out any part of a transfer that was never sealed", async () => {
    const ownerToken = generateToken(32);
    await createDropRoute(
      jsonRequest("/api/drops", {
        protocolVersion: 1,
        dropId: keys.dropId,
        ownerTokenHash: await hashToken(ownerToken, "drop"),
        manifest: await encryptDropManifest(keys, manifest),
        fileCount: 1,
        partCount: 1,
        totalBytes: plaintext.byteLength,
      }),
    );
    const authorized = await downloadRoute(
      jsonRequest(`/api/drops/${keys.dropId}/download`, { indexes: [0] }),
      params(keys.dropId),
    );
    expect(authorized.status).toBe(404);
  }, 30_000);

  it("refuses a commit whose declared size does not match what was stored", async () => {
    const ownerToken = generateToken(32);
    await createDropRoute(
      jsonRequest("/api/drops", {
        protocolVersion: 1,
        dropId: keys.dropId,
        ownerTokenHash: await hashToken(ownerToken, "drop"),
        manifest: await encryptDropManifest(keys, manifest),
        fileCount: 1,
        partCount: 1,
        totalBytes: plaintext.byteLength,
      }),
    );
    const authorized = await authorizePartsRoute(
      jsonRequest(
        `/api/drops/${keys.dropId}/parts`,
        { indexes: [0] },
        { "x-print-cess-drop-token": ownerToken },
      ),
      params(keys.dropId),
    );
    const { operations } = (await authorized.json()) as { operations: Operation[] };
    await putPart(operations[0]!, new Uint8Array(64));

    const committed = await commitPartsRoute(
      jsonRequest(
        `/api/drops/${keys.dropId}/parts/complete`,
        { parts: [{ index: 0, size: 65 }] },
        { "x-print-cess-drop-token": ownerToken },
      ),
      params(keys.dropId),
    );
    expect(committed.status).toBe(409);
  }, 30_000);
});
