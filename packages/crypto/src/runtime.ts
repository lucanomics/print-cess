export function cryptoRuntime(): Crypto {
  if (!globalThis.crypto?.subtle) {
    throw new Error("A standards-compliant Web Crypto implementation is required");
  }
  return globalThis.crypto;
}

export function asArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.slice().buffer;
}
