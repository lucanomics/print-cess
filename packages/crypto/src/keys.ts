import { fromBase64Url, toBase64Url } from "./encoding.js";
import { asArrayBuffer, cryptoRuntime } from "./runtime.js";

const ECDH_PARAMETERS = { name: "ECDH", namedCurve: "P-256" } as const;

export async function generateEcdhKeyPair(): Promise<CryptoKeyPair> {
  return cryptoRuntime().subtle.generateKey(ECDH_PARAMETERS, true, ["deriveBits"]);
}

export async function exportPublicKey(publicKey: CryptoKey): Promise<Uint8Array> {
  return new Uint8Array(await cryptoRuntime().subtle.exportKey("raw", publicKey));
}

export async function exportPublicKeyBase64Url(publicKey: CryptoKey): Promise<string> {
  return toBase64Url(await exportPublicKey(publicKey));
}

export async function importPublicKey(rawKey: Uint8Array | string): Promise<CryptoKey> {
  const bytes = typeof rawKey === "string" ? fromBase64Url(rawKey) : rawKey;
  if (bytes.byteLength !== 65 || bytes[0] !== 4) {
    throw new Error("Invalid uncompressed P-256 public key");
  }
  return cryptoRuntime().subtle.importKey("raw", asArrayBuffer(bytes), ECDH_PARAMETERS, false, []);
}

export async function fingerprintPublicKey(rawKey: Uint8Array | string): Promise<string> {
  const bytes = typeof rawKey === "string" ? fromBase64Url(rawKey) : rawKey;
  const digest = await cryptoRuntime().subtle.digest("SHA-256", asArrayBuffer(bytes));
  return toBase64Url(new Uint8Array(digest));
}

export async function deriveSharedSecret(
  privateKey: CryptoKey,
  peerPublicKey: CryptoKey,
): Promise<Uint8Array> {
  const bits = await cryptoRuntime().subtle.deriveBits(
    { name: "ECDH", public: peerPublicKey },
    privateKey,
    256,
  );
  return new Uint8Array(bits);
}
