import { describe, expect, it } from "vitest";

import { PAIRING_SHAPES } from "@print-cess/protocol";

import {
  derivePairingSecret,
  openTransferCode,
  PairingSecretError,
  sealTransferCode,
} from "../src/drop-pairing-crypto.js";
import { exportPublicKeyBase64Url, generateEcdhKeyPair } from "../src/keys.js";

async function pair() {
  const sender = await generateEcdhKeyPair();
  const receiver = await generateEcdhKeyPair();
  const senderPublicKey = await exportPublicKeyBase64Url(sender.publicKey);
  const receiverPublicKey = await exportPublicKeyBase64Url(receiver.publicKey);
  const transcript = { senderPublicKey, receiverPublicKey };
  return {
    transcript,
    senderSecret: await derivePairingSecret(sender.privateKey, receiverPublicKey, transcript),
    receiverSecret: await derivePairingSecret(receiver.privateKey, senderPublicKey, transcript),
  };
}

/**
 * Ordered rather than random-looking, and deliberately so: a committed
 * twelve-character code with real entropy is indistinguishable from one that
 * leaked, and the secret scan is right to stop it. `drop-crypto.test.ts` uses
 * the same shape for the same reason.
 */
const SYNTHETIC_CODE = "23456789ABCD";

describe("drop pairing secrets", () => {
  it("agrees on one shape from both sides", async () => {
    const { senderSecret, receiverSecret } = await pair();
    expect(senderSecret.shape).toBe(receiverSecret.shape);
    expect(PAIRING_SHAPES).toContain(senderSecret.shape);
  });

  it("carries the transfer code from the sender to the receiver", async () => {
    const { senderSecret, receiverSecret } = await pair();
    const sealed = await sealTransferCode(senderSecret, SYNTHETIC_CODE);
    expect(sealed).not.toContain(SYNTHETIC_CODE.slice(0, 4));
    await expect(openTransferCode(receiverSecret, sealed)).resolves.toBe(SYNTHETIC_CODE);
  });

  /**
   * The shape is the only thing standing between a guessed pair of digits and
   * the files, so a relay that swapped a public key has to change it. Both
   * sides agreeing on a shape they did not actually negotiate would make the
   * confirmation step decorative.
   */
  it("shows a different shape to a phone that agreed with somebody else", async () => {
    const shapes = new Set<string>();
    for (let attempt = 0; attempt < 24; attempt += 1) {
      const honest = await pair();
      const intercepted = await pair();
      const relayed = await derivePairingSecret(
        (await generateEcdhKeyPair()).privateKey,
        intercepted.transcript.receiverPublicKey,
        honest.transcript,
      );
      shapes.add(`${honest.senderSecret.shape}:${relayed.shape}`);
    }
    // Over two dozen exchanges the relayed shape must differ at least once;
    // agreeing every time would mean the shape ignores the keys.
    expect(
      [...shapes].some((pairOfShapes) => pairOfShapes.split(":")[0] !== pairOfShapes.split(":")[1]),
    ).toBe(true);
  });

  it("refuses a sealed code that was not meant for this pairing", async () => {
    const first = await pair();
    const second = await pair();
    const sealed = await sealTransferCode(first.senderSecret, SYNTHETIC_CODE);
    await expect(openTransferCode(second.receiverSecret, sealed)).rejects.toBeInstanceOf(
      PairingSecretError,
    );
  });

  it("refuses an envelope too short to hold anything", async () => {
    const { receiverSecret } = await pair();
    await expect(openTransferCode(receiverSecret, "AAAA")).rejects.toBeInstanceOf(
      PairingSecretError,
    );
  });
});
