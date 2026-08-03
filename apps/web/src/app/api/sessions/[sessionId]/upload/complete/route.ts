import { MAX_ENVELOPE_BYTES, uploadCompleteRequestSchema } from "@print-cess/protocol";

import { authenticateToken, bearerToken } from "@/server/auth";
import { getRuntime } from "@/server/runtime";
import { assertAllowedOrigin, errorResponse, json, readJson, readSessionId } from "@/server/http";
import { ServiceError } from "@/server/errors";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ sessionId: string }> }) {
  try {
    const server = getRuntime();
    assertAllowedOrigin(request, server.config);
    const sessionId = await readSessionId(context);
    const current = await server.sessions.get(sessionId);
    if (!current?.encryptedBlobPath)
      throw new ServiceError("not_found", "The encrypted upload was not found.", 404);
    const tokenHash = await authenticateToken(
      bearerToken(request, "x-print-cess-mobile-token"),
      current.mobileTokenHash,
      "mobile",
    );
    const body = await readJson(request, uploadCompleteRequestSchema);
    const provider = await server.blobs.head(current.encryptedBlobPath);
    if (provider.size !== body.size || provider.size < 152 || provider.size > MAX_ENVELOPE_BYTES) {
      throw new ServiceError("conflict", "The uploaded ciphertext metadata does not match.", 409);
    }
    const session = await server.sessions.markUploaded(sessionId, tokenHash, provider, Date.now());
    return json({ sessionId, status: session.status, expiresAt: session.expiresAt });
  } catch (error) {
    return errorResponse(error);
  }
}
