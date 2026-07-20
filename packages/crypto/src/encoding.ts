export function toBase64Url(bytes: Uint8Array): string {
  if (typeof window === "undefined" && typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64url");
  }
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

export function fromBase64Url(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) throw new Error("Invalid base64url value");
  if (typeof window === "undefined" && typeof Buffer !== "undefined") {
    return new Uint8Array(Buffer.from(value, "base64url"));
  }
  const padded = value
    .replaceAll("-", "+")
    .replaceAll("_", "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export function fromCanonicalBase64Url(value: string, expectedBytes: number): Uint8Array {
  const decoded = fromBase64Url(value);
  if (decoded.byteLength !== expectedBytes || toBase64Url(decoded) !== value) {
    throw new Error("Non-canonical base64url value");
  }
  return decoded;
}
