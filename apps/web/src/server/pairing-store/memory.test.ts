import { describe, expect, it } from "vitest";

import type { PairingRecord } from "@print-cess/protocol";

import { ServiceError } from "../errors";
import { MemoryPairingStore } from "./memory";

const HASH_A = "a".repeat(42) + "A";
const HASH_B = "b".repeat(42) + "A";
const KEY_A = "B" + "A".repeat(85) + "A";
const KEY_B = "B" + "B".repeat(85) + "A";

function draft(now = 1_000): Omit<PairingRecord, "code"> {
  return {
    protocolVersion: 1,
    state: "waiting",
    senderTokenHash: HASH_A,
    senderPublicKey: KEY_A,
    createdAt: now,
    expiresAt: now + 180_000,
    revision: 0,
  };
}

describe("MemoryPairingStore", () => {
  it("takes the first code nobody holds", async () => {
    const store = new MemoryPairingStore();
    const first = await store.claim(draft(), ["42", "43"]);
    const second = await store.claim(draft(), ["42", "43"]);
    expect(first?.code).toBe("42");
    expect(second?.code).toBe("43");
  });

  it("reports exhaustion rather than overwriting a live pairing", async () => {
    const store = new MemoryPairingStore();
    await store.claim(draft(), ["42"]);
    await expect(store.claim(draft(), ["42"])).resolves.toBeNull();
  });

  /** A hundred codes is a small pool, so an expired one has to come back. */
  it("hands an expired code back out", async () => {
    const store = new MemoryPairingStore();
    await store.claim(draft(1_000), ["42"]);
    const later = await store.claim(draft(200_000), ["42"]);
    expect(later?.code).toBe("42");
  });

  it("admits one receiver and turns the next away", async () => {
    const store = new MemoryPairingStore();
    await store.claim(draft(), ["42"]);
    const joined = await store.join(
      "42",
      { receiverTokenHash: HASH_B, receiverPublicKey: KEY_B },
      1_000,
    );
    expect(joined.state).toBe("joined");
    await expect(
      store.join("42", { receiverTokenHash: HASH_A, receiverPublicKey: KEY_A }, 1_000),
    ).rejects.toBeInstanceOf(ServiceError);
  });

  it("answers an expired pairing exactly as one that never existed", async () => {
    const store = new MemoryPairingStore();
    await store.claim(draft(1_000), ["42"]);
    const expired = store.join(
      "42",
      { receiverTokenHash: HASH_B, receiverPublicKey: KEY_B },
      500_000,
    );
    const missing = store.join(
      "77",
      { receiverTokenHash: HASH_B, receiverPublicKey: KEY_B },
      1_000,
    );
    await expect(expired).rejects.toThrow("Those numbers do not match a transfer.");
    await expect(missing).rejects.toThrow("Those numbers do not match a transfer.");
  });

  /**
   * The sealed code is the whole secret. Storing it for a caller who cannot
   * prove it claimed the pairing would hand the transfer to whoever asked.
   */
  it("refuses a delivery that does not come from the sender", async () => {
    const store = new MemoryPairingStore();
    await store.claim(draft(), ["42"]);
    await store.join("42", { receiverTokenHash: HASH_B, receiverPublicKey: KEY_B }, 1_000);
    await expect(store.deliver("42", HASH_B, "sealed", 1_000)).rejects.toBeInstanceOf(ServiceError);
    const delivered = await store.deliver("42", HASH_A, "sealed", 1_000);
    expect(delivered).toMatchObject({ state: "delivered", sealedCode: "sealed" });
  });

  it("refuses to deliver before a receiver has joined", async () => {
    const store = new MemoryPairingStore();
    await store.claim(draft(), ["42"]);
    await expect(store.deliver("42", HASH_A, "sealed", 1_000)).rejects.toBeInstanceOf(ServiceError);
  });
});
