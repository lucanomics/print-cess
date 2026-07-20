import { createHash, timingSafeEqual } from "node:crypto";

import { fromCanonicalBase64Url, hashToken, type TokenKind } from "@print-cess/crypto";

import { ServiceError } from "./errors";

export async function authenticateToken(
  rawToken: string | null,
  storedHash: string | undefined,
  kind: TokenKind,
): Promise<string> {
  if (!rawToken || rawToken.length > 128 || !storedHash) {
    throw new ServiceError("unauthorized", "The session credential is invalid.", 401);
  }
  let candidateHash: string;
  try {
    candidateHash = await hashToken(rawToken, kind);
  } catch {
    candidateHash = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
  }
  const candidate = fromCanonicalBase64Url(candidateHash, 32);
  const expected = fromCanonicalBase64Url(storedHash, 32);
  if (!timingSafeEqual(Buffer.from(candidate), Buffer.from(expected))) {
    throw new ServiceError("unauthorized", "The session credential is invalid.", 401);
  }
  return candidateHash;
}

export function bearerToken(request: Request, header: string): string | null {
  const value = request.headers.get(header);
  return value && value.length <= 128 ? value : null;
}

export function secretMatches(supplied: string | null, expected: string | undefined): boolean {
  const suppliedDigest = createHash("sha256")
    .update(supplied ?? "")
    .digest();
  const expectedDigest = createHash("sha256")
    .update(expected ?? "")
    .digest();
  return Boolean(supplied && expected && timingSafeEqual(suppliedDigest, expectedDigest));
}
