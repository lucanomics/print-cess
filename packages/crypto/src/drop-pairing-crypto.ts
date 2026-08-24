import { PAIRING_SHAPES, type PairingShape } from "@print-cess/protocol";

import { fromBase64Url, toBase64Url } from "./encoding.js";
import { deriveSharedSecret, importPublicKey } from "./keys.js";
import { asArrayBuffer, cryptoRuntime } from "./runtime.js";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const PAIRING_HKDF_INFO = "print-cess-by-paradiso:drop-pairing:v1";
const PAIRING_SHAPE_INFO = "print-cess-by-paradiso:drop-pairing-shape:v1";
const IV_BYTES = 12;

/**
 * What both phones hold once they have exchanged public keys: a key that seals
 * the transfer code, and the shape their humans compare. Both come from the
 * same agreed secret, so a relay that swapped either public key produces a
 * different shape on each side and the sending human is the one who notices.
 */
export type PairingSecret = {
  sealingKey: CryptoKey;
  shape: PairingShape;
};

export class PairingSecretError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "PairingSecretError";
  }
}

/**
 * Both phones run this and must reach the same answer. The transcript is fixed
 * in sender-then-receiver order rather than in the order each side happens to
 * hold the keys, so the two derivations agree without either phone having to
 * know which role the other played.
 */
export async function derivePairingSecret(
  privateKey: CryptoKey,
  peerPublicKey: string,
  transcript: { senderPublicKey: string; receiverPublicKey: string },
): Promise<PairingSecret> {
  const shared = await deriveSharedSecret(privateKey, await importPublicKey(peerPublicKey));
  const subtle = cryptoRuntime().subtle;
  const root = await subtle.importKey("raw", asArrayBuffer(shared), "HKDF", false, [
    "deriveKey",
    "deriveBits",
  ]);
  shared.fill(0);

  // Binding the salt to both public keys is what makes the shape a check on the
  // exchange rather than on the shared secret alone.
  const salt = encoder.encode(`${transcript.senderPublicKey}:${transcript.receiverPublicKey}`);
  const sealingKey = await subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: asArrayBuffer(salt),
      info: asArrayBuffer(encoder.encode(PAIRING_HKDF_INFO)),
    },
    root,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
  const shapeBits = new Uint8Array(
    await subtle.deriveBits(
      {
        name: "HKDF",
        hash: "SHA-256",
        salt: asArrayBuffer(salt),
        info: asArrayBuffer(encoder.encode(PAIRING_SHAPE_INFO)),
      },
      root,
      8,
    ),
  );
  // PAIRING_SHAPES has four entries and 256 is a multiple of four, so a plain
  // remainder draws each shape with equal probability.
  const shape = PAIRING_SHAPES[shapeBits[0]! % PAIRING_SHAPES.length]!;
  return { sealingKey, shape };
}

/** Seals the transfer code for one receiver, once the sender's human agreed. */
export async function sealTransferCode(secret: PairingSecret, code: string): Promise<string> {
  const iv = cryptoRuntime().getRandomValues(new Uint8Array(IV_BYTES));
  const sealed = new Uint8Array(
    await cryptoRuntime().subtle.encrypt(
      { name: "AES-GCM", iv: asArrayBuffer(iv) },
      secret.sealingKey,
      asArrayBuffer(encoder.encode(code)),
    ),
  );
  const envelope = new Uint8Array(iv.length + sealed.length);
  envelope.set(iv, 0);
  envelope.set(sealed, iv.length);
  return toBase64Url(envelope);
}

export async function openTransferCode(secret: PairingSecret, envelope: string): Promise<string> {
  const bytes = fromBase64Url(envelope);
  if (bytes.length <= IV_BYTES) throw new PairingSecretError("Sealed code is too short");
  try {
    const plaintext = await cryptoRuntime().subtle.decrypt(
      { name: "AES-GCM", iv: asArrayBuffer(bytes.slice(0, IV_BYTES)) },
      secret.sealingKey,
      asArrayBuffer(bytes.slice(IV_BYTES)),
    );
    return decoder.decode(plaintext);
  } catch {
    throw new PairingSecretError("Sealed code did not open");
  }
}
