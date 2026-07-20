import { fromBase64Url, fromCanonicalBase64Url, toBase64Url } from "./encoding.js";
import { asArrayBuffer, cryptoRuntime } from "./runtime.js";

export function generateToken(byteLength = 32): string {
  if (!Number.isInteger(byteLength) || byteLength < 16) {
    throw new Error("Security tokens must contain at least 128 bits of entropy");
  }
  return toBase64Url(cryptoRuntime().getRandomValues(new Uint8Array(byteLength)));
}

export type TokenKind = "upload" | "kiosk" | "mobile";

export async function hashToken(token: string, kind: TokenKind): Promise<string> {
  const tokenBytes = fromCanonicalBase64Url(token, 32);
  const domain = new TextEncoder().encode(`print-cess-by-paradiso:token-hash:${kind}:v1`);
  const input = new Uint8Array(domain.byteLength + 1 + tokenBytes.byteLength);
  input.set(domain, 0);
  input[domain.byteLength] = 0;
  input.set(tokenBytes, domain.byteLength + 1);
  const digest = await cryptoRuntime().subtle.digest("SHA-256", asArrayBuffer(input));
  tokenBytes.fill(0);
  input.fill(0);
  return toBase64Url(new Uint8Array(digest));
}

export function timingSafeEqual(left: Uint8Array, right: Uint8Array): boolean {
  const maximumLength = Math.max(left.byteLength, right.byteLength);
  let difference = left.byteLength ^ right.byteLength;
  for (let index = 0; index < maximumLength; index += 1) {
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }
  return difference === 0;
}

export function timingSafeEqualBase64Url(left: string, right: string): boolean {
  try {
    return timingSafeEqual(fromBase64Url(left), fromBase64Url(right));
  } catch {
    return false;
  }
}
