import { describe, expect, it } from "vitest";

import { decryptDocument, encryptDocument } from "../src/document-crypto.js";
import { exportPublicKey, fingerprintPublicKey, generateEcdhKeyPair } from "../src/keys.js";
import { generateToken, hashToken, timingSafeEqualBase64Url } from "../src/tokens.js";

const plaintext = new TextEncoder().encode("SYNTHETIC TEST DOCUMENT — NOT VALID");

async function testContext() {
  const kiosk = await generateEcdhKeyPair();
  const publicKey = await exportPublicKey(kiosk.publicKey);
  const fingerprint = await fingerprintPublicKey(publicKey);
  return {
    kiosk,
    publicKey,
    context: {
      protocolVersion: 1 as const,
      sessionId: "ABEiM0RVZneImaq7zN3u_w",
      kioskPublicKeyFingerprint: fingerprint,
    },
  };
}

describe("end-to-end document encryption", () => {
  it("round-trips ECDH, HKDF, and AES-GCM", async () => {
    const { kiosk, publicKey, context } = await testContext();
    const envelope = await encryptDocument({
      plaintext,
      fileKind: "pdf",
      context,
      kioskPublicKey: publicKey,
    });
    const decrypted = await decryptDocument(envelope, context, kiosk.privateKey);
    expect(decrypted.fileKind).toBe("pdf");
    expect(decrypted.plaintext).toEqual(plaintext);
  });

  it.each(["ciphertext byte", "tag byte", "IV byte", "salt byte", "public-key byte"])(
    "rejects a changed %s",
    async (part) => {
      const { kiosk, publicKey, context } = await testContext();
      const envelope = await encryptDocument({
        plaintext,
        fileKind: "pdf",
        context,
        kioskPublicKey: publicKey,
      });
      const changed = envelope.slice();
      const index =
        part === "public-key byte"
          ? 30
          : part === "salt byte"
            ? 95
            : part === "IV byte"
              ? 128
              : part === "tag byte"
                ? changed.length - 1
                : changed.length - 17;
      changed[index] ^= 1;
      await expect(decryptDocument(changed, context, kiosk.privateKey)).rejects.toThrow();
    },
  );

  it("rejects an AAD session mismatch", async () => {
    const { kiosk, publicKey, context } = await testContext();
    const envelope = await encryptDocument({
      plaintext,
      fileKind: "pdf",
      context,
      kioskPublicKey: publicKey,
    });
    await expect(
      decryptDocument(
        envelope,
        { ...context, sessionId: "_-7dzLuqmYh3QeKxRjPa0A" },
        kiosk.privateKey,
      ),
    ).rejects.toThrow();
  });
});

describe("security tokens", () => {
  it("hashes and compares without retaining the token", async () => {
    const token = generateToken();
    const hash = await hashToken(token, "upload");
    expect(hash).not.toContain(token);
    expect(timingSafeEqualBase64Url(hash, await hashToken(token, "upload"))).toBe(true);
    expect(timingSafeEqualBase64Url(hash, await hashToken(token, "kiosk"))).toBe(false);
    await expect(hashToken(`${token}x`, "upload")).rejects.toThrow();
  });
});
