import {
  AES_GCM_IV_BYTES,
  AES_GCM_TAG_BYTES,
  HKDF_INFO,
  HKDF_SALT_BYTES,
  MAX_PLAINTEXT_BYTES,
  MAX_PRINT_BUNDLE_BYTES,
  assembleEnvelope,
  buildAad,
  encodeEnvelopeHeader,
  parseEnvelope,
  type AadContext,
  type FileKind,
} from "@print-cess/protocol";

import {
  exportPublicKey,
  generateEcdhKeyPair,
  importPublicKey,
  deriveSharedSecret,
} from "./keys.js";
import { asArrayBuffer, cryptoRuntime } from "./runtime.js";

export type EncryptDocumentInput = {
  plaintext: Uint8Array;
  fileKind: FileKind;
  context: AadContext;
  kioskPublicKey: Uint8Array | string;
  salt?: Uint8Array;
  iv?: Uint8Array;
  mobileKeyPair?: CryptoKeyPair;
};

export async function encryptDocument(input: EncryptDocumentInput): Promise<Uint8Array> {
  const maximumPlaintext =
    input.fileKind === "bundle" ? MAX_PRINT_BUNDLE_BYTES : MAX_PLAINTEXT_BYTES;
  if (input.plaintext.byteLength > maximumPlaintext) {
    throw new Error(
      input.fileKind === "bundle"
        ? "Print bundle exceeds the 32 MiB plaintext limit"
        : "Document exceeds the 10 MiB plaintext limit",
    );
  }
  const runtime = cryptoRuntime();
  const keyPair = input.mobileKeyPair ?? (await generateEcdhKeyPair());
  const ephemeralPublicKey = await exportPublicKey(keyPair.publicKey);
  const kioskPublicKey = await importPublicKey(input.kioskPublicKey);
  const salt = input.salt?.slice() ?? runtime.getRandomValues(new Uint8Array(HKDF_SALT_BYTES));
  const iv = input.iv?.slice() ?? runtime.getRandomValues(new Uint8Array(AES_GCM_IV_BYTES));
  if (salt.byteLength !== HKDF_SALT_BYTES || iv.byteLength !== AES_GCM_IV_BYTES) {
    throw new Error("Invalid salt or IV length");
  }
  const sharedSecret = await deriveSharedSecret(keyPair.privateKey, kioskPublicKey);
  try {
    const aesKey = await deriveAesKey(sharedSecret, salt);
    const header = encodeEnvelopeHeader({
      protocolVersion: 1,
      fileKind: input.fileKind,
      plaintextLength: input.plaintext.byteLength,
      ephemeralPublicKey,
      salt,
      iv,
    });
    const ciphertext = new Uint8Array(
      await runtime.subtle.encrypt(
        {
          name: "AES-GCM",
          iv: asArrayBuffer(iv),
          additionalData: asArrayBuffer(buildAad(input.context, header)),
          tagLength: AES_GCM_TAG_BYTES * 8,
        },
        aesKey,
        asArrayBuffer(input.plaintext),
      ),
    );
    return assembleEnvelope(header, ciphertext);
  } finally {
    sharedSecret.fill(0);
  }
}

export async function decryptDocument(
  envelope: Uint8Array,
  context: AadContext,
  kioskPrivateKey: CryptoKey,
): Promise<{ plaintext: Uint8Array; fileKind: FileKind }> {
  const parsed = parseEnvelope(envelope);
  const mobilePublicKey = await importPublicKey(parsed.ephemeralPublicKey);
  const sharedSecret = await deriveSharedSecret(kioskPrivateKey, mobilePublicKey);
  try {
    const aesKey = await deriveAesKey(sharedSecret, parsed.salt);
    const plaintext = new Uint8Array(
      await cryptoRuntime().subtle.decrypt(
        {
          name: "AES-GCM",
          iv: asArrayBuffer(parsed.iv),
          additionalData: asArrayBuffer(buildAad(context, parsed.header)),
          tagLength: AES_GCM_TAG_BYTES * 8,
        },
        aesKey,
        asArrayBuffer(parsed.ciphertextAndTag),
      ),
    );
    if (plaintext.byteLength !== parsed.plaintextLength) {
      plaintext.fill(0);
      throw new Error("Authenticated plaintext length does not match the envelope");
    }
    return { plaintext, fileKind: parsed.fileKind };
  } finally {
    sharedSecret.fill(0);
  }
}

async function deriveAesKey(sharedSecret: Uint8Array, salt: Uint8Array): Promise<CryptoKey> {
  const subtle = cryptoRuntime().subtle;
  const material = await subtle.importKey("raw", asArrayBuffer(sharedSecret), "HKDF", false, [
    "deriveKey",
  ]);
  return subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: asArrayBuffer(salt),
      info: asArrayBuffer(new TextEncoder().encode(HKDF_INFO)),
    },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}
