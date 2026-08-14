import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DropRecord } from "@print-cess/protocol";

import { ServiceError } from "../errors";
import { MemoryDropStore } from "./memory";
import { uploadedPartCount } from "./transitions";

const DROP_ID = "A".repeat(21) + "A";
const OWNER = "A".repeat(43);
const IMPOSTOR = "B".repeat(42) + "A";
const NOW = 1_000;

function drop(overrides: Partial<DropRecord> = {}): DropRecord {
  return {
    protocolVersion: 1,
    dropId: DROP_ID,
    status: "collecting",
    ownerTokenHash: OWNER,
    manifest: "sealedManifest",
    fileCount: 1,
    partCount: 2,
    parts: [null, null],
    totalCiphertextBytes: 0,
    downloadCount: 0,
    createdAt: NOW,
    expiresAt: NOW + 1_800_000,
    revision: 0,
    ...overrides,
  };
}

let store: MemoryDropStore;

beforeEach(() => {
  // The store prunes against the wall clock, so the suite pins it next to the
  // timestamps the fixtures use.
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  store = new MemoryDropStore();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("MemoryDropStore", () => {
  it("stores and returns a copy, never the live record", async () => {
    await store.create(drop(), 600_000);
    const first = await store.get(DROP_ID);
    first!.downloadCount = 99;
    await expect(store.get(DROP_ID)).resolves.toMatchObject({ downloadCount: 0 });
  });

  it("refuses a second transfer under the same identifier", async () => {
    await store.create(drop(), 600_000);
    await expect(store.create(drop(), 600_000)).rejects.toMatchObject({ status: 409 });
  });

  it("commits parts and reports progress", async () => {
    await store.create(drop(), 600_000);
    const updated = await store.commitParts(DROP_ID, OWNER, [{ index: 0, size: 40 }], NOW);
    expect(uploadedPartCount(updated)).toBe(1);
    expect(updated.totalCiphertextBytes).toBe(40);
    expect(updated.revision).toBe(1);
  });

  it("treats a repeated commit of the same part as already done", async () => {
    await store.create(drop(), 600_000);
    await store.commitParts(DROP_ID, OWNER, [{ index: 0, size: 40 }], NOW);
    const repeated = await store.commitParts(DROP_ID, OWNER, [{ index: 0, size: 40 }], NOW);
    // A phone that retries after a lost response must not double-count bytes.
    expect(repeated.totalCiphertextBytes).toBe(40);
    expect(repeated.revision).toBe(1);
  });

  it("refuses a second, different upload for one part", async () => {
    await store.create(drop(), 600_000);
    await store.commitParts(DROP_ID, OWNER, [{ index: 0, size: 40 }], NOW);
    await expect(
      store.commitParts(DROP_ID, OWNER, [{ index: 0, size: 41 }], NOW),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("refuses a part index outside the transfer", async () => {
    await store.create(drop(), 600_000);
    await expect(
      store.commitParts(DROP_ID, OWNER, [{ index: 5, size: 40 }], NOW),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("refuses anyone but the sender", async () => {
    await store.create(drop(), 600_000);
    await expect(
      store.commitParts(DROP_ID, IMPOSTOR, [{ index: 0, size: 40 }], NOW),
    ).rejects.toMatchObject({ status: 401 });
    await expect(store.seal(DROP_ID, IMPOSTOR, NOW)).rejects.toMatchObject({ status: 401 });
  });

  it("refuses to seal while a part is missing", async () => {
    await store.create(drop(), 600_000);
    await store.commitParts(DROP_ID, OWNER, [{ index: 0, size: 40 }], NOW);
    await expect(store.seal(DROP_ID, OWNER, NOW)).rejects.toMatchObject({ status: 409 });
  });

  it("seals once every part has landed, and stays sealed", async () => {
    await store.create(drop(), 600_000);
    await store.commitParts(
      DROP_ID,
      OWNER,
      [
        { index: 0, size: 40 },
        { index: 1, size: 24 },
      ],
      NOW,
    );
    const sealed = await store.seal(DROP_ID, OWNER, NOW);
    expect(sealed.status).toBe("ready");
    const again = await store.seal(DROP_ID, OWNER, NOW);
    expect(again.revision).toBe(sealed.revision);
  });

  it("refuses to accept parts after sealing", async () => {
    await store.create(drop({ partCount: 1, parts: [{ size: 40 }] }), 600_000);
    await store.seal(DROP_ID, OWNER, NOW);
    await expect(
      store.commitParts(DROP_ID, OWNER, [{ index: 0, size: 40 }], NOW),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("counts a pickup only once the transfer is ready", async () => {
    await store.create(drop({ partCount: 1, parts: [{ size: 40 }] }), 600_000);
    await expect(store.recordDownload(DROP_ID, NOW)).rejects.toMatchObject({ status: 404 });
    await store.seal(DROP_ID, OWNER, NOW);
    await expect(store.recordDownload(DROP_ID, NOW)).resolves.toMatchObject({ downloadCount: 1 });
  });

  it("reports an expired transfer as gone rather than merely missing", async () => {
    await store.create(drop({ expiresAt: NOW + 1 }), 600_000);
    await expect(store.recordDownload(DROP_ID, NOW + 2)).rejects.toMatchObject({ status: 410 });
  });

  it("lists expired transfers so their ciphertext can be erased", async () => {
    await store.create(drop({ expiresAt: NOW + 1 }), 600_000);
    await expect(store.listExpired(NOW, 10)).resolves.toEqual([]);
    const due = await store.listExpired(NOW + 2, 10);
    expect(due).toHaveLength(1);
    expect(due[0]?.dropId).toBe(DROP_ID);
  });

  it("forgets a transfer once its retention window closes", async () => {
    await store.create(drop({ expiresAt: NOW + 1_000 }), 10_000);
    await expect(store.get(DROP_ID)).resolves.not.toBeNull();
    vi.setSystemTime(NOW + 1_000 + 10_001);
    await expect(store.get(DROP_ID)).resolves.toBeNull();
  });

  it("removes a transfer on request", async () => {
    await store.create(drop(), 600_000);
    await store.remove(DROP_ID);
    await expect(store.get(DROP_ID)).resolves.toBeNull();
    await expect(store.seal(DROP_ID, OWNER, NOW)).rejects.toBeInstanceOf(ServiceError);
  });
});
