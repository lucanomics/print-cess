import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { decryptDocument, encryptDocument } from "../src/document-crypto";
import { toBase64Url } from "../src/encoding";

type Vector = Record<string, string> & { protocolVersion: 1 };
const vector = JSON.parse(
  await readFile(new URL("../../test-fixtures/vectors/protocol-v1.json", import.meta.url), "utf8"),
) as Vector;

describe("shared TypeScript/C# protocol vector", () => {
  it("emits the byte-identical deterministic envelope and decrypts it", async () => {
    const kiosk = await importPair(vector.kioskPublicKeyHex, vector.kioskPrivateScalarHex);
    const mobile = await importPair(vector.mobilePublicKeyHex, vector.mobilePrivateScalarHex);
    const envelope = await encryptDocument({
      plaintext: new TextEncoder().encode(vector.plaintextUtf8),
      fileKind: "pdf",
      context: {
        protocolVersion: 1,
        sessionId: vector.sessionId,
        kioskPublicKeyFingerprint: vector.kioskFingerprint,
      },
      kioskPublicKey: hex(vector.kioskPublicKeyHex),
      mobileKeyPair: mobile,
      salt: hex(vector.saltHex),
      iv: hex(vector.ivHex),
    });
    const expectedEnvelope = hex(`${vector.headerHex}${vector.ciphertextHex}${vector.tagHex}`);
    expect(envelope).toEqual(expectedEnvelope);
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", envelope));
    expect(toHex(digest)).toBe(vector.envelopeSha256Hex);
    const decrypted = await decryptDocument(
      envelope,
      {
        protocolVersion: 1,
        sessionId: vector.sessionId,
        kioskPublicKeyFingerprint: vector.kioskFingerprint,
      },
      kiosk.privateKey,
    );
    expect(new TextDecoder().decode(decrypted.plaintext)).toBe(vector.plaintextUtf8);
  });
});

async function importPair(publicHex: string, privateHex: string): Promise<CryptoKeyPair> {
  const raw = hex(publicHex);
  const jwk: JsonWebKey = {
    kty: "EC",
    crv: "P-256",
    x: toBase64Url(raw.slice(1, 33)),
    y: toBase64Url(raw.slice(33, 65)),
    d: toBase64Url(hex(privateHex)),
    ext: true,
    key_ops: ["deriveBits"],
  };
  const privateKey = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  );
  const publicKey = await crypto.subtle.importKey(
    "raw",
    raw,
    { name: "ECDH", namedCurve: "P-256" },
    true,
    [],
  );
  return { privateKey, publicKey };
}

function hex(value: string): Uint8Array {
  return Uint8Array.from(value.match(/.{2}/gu) ?? [], (byte) => Number.parseInt(byte, 16));
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
