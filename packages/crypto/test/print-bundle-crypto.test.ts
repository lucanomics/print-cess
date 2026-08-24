import { describe, expect, it } from "vitest";

import { MAX_PLAINTEXT_BYTES } from "@print-cess/protocol";

import { decryptDocument, encryptDocument } from "../src/document-crypto.js";
import { exportPublicKey, fingerprintPublicKey, generateEcdhKeyPair } from "../src/keys.js";

describe("print bundle encryption", () => {
  it("allows an authenticated bundle above the ordinary 10 MiB document ceiling", async () => {
    const kiosk = await generateEcdhKeyPair();
    const publicKey = await exportPublicKey(kiosk.publicKey);
    const context = {
      protocolVersion: 1 as const,
      sessionId: "ABEiM0RVZneImaq7zN3u_w",
      kioskPublicKeyFingerprint: await fingerprintPublicKey(publicKey),
    };
    const plaintext = new Uint8Array(MAX_PLAINTEXT_BYTES + 1024);
    plaintext[0] = 0x50;
    plaintext[plaintext.length - 1] = 0x31;

    const envelope = await encryptDocument({
      plaintext,
      fileKind: "bundle",
      context,
      kioskPublicKey: publicKey,
    });
    const decrypted = await decryptDocument(envelope, context, kiosk.privateKey);

    expect(decrypted.fileKind).toBe("bundle");
    expect(decrypted.plaintext.byteLength).toBe(plaintext.byteLength);
    expect(decrypted.plaintext[0]).toBe(0x50);
    expect(decrypted.plaintext[decrypted.plaintext.length - 1]).toBe(0x31);
    decrypted.plaintext.fill(0);
    plaintext.fill(0);
  });
});
