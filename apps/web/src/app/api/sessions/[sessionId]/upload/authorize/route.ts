import { authorizeUploadRequestSchema, MAX_ENVELOPE_BYTES } from "@print-cess/protocol";

import { authenticateToken, bearerToken } from "@/server/auth";
import { createBlobPath, getRuntime, signedExpiry } from "@/server/runtime";
import { assertAllowedOrigin, errorResponse, json, readJson, readSessionId } from "@/server/http";
import { ServiceError } from "@/server/errors";
import { enforceRateLimit } from "@/server/rate-limit";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ sessionId: string }> }) {
  try {
    const server = getRuntime();
    assertAllowedOrigin(request, server.config);
    const sessionId = await readSessionId(context);
    enforceRateLimit(`upload-authorize:${sessionId}`, 10, 60_000);
    const current = await server.sessions.get(sessionId);
    if (!current) throw new ServiceError("not_found", "The print session was not found.", 404);
    const tokenHash = await authenticateToken(
      bearerToken(request, "x-print-cess-mobile-token"),
      current.mobileTokenHash,
      "mobile",
    );
    const body = await readJson(request, authorizeUploadRequestSchema);
    const authorization = await server.sessions.authorizeUpload(
      sessionId,
      tokenHash,
      body.operationIdHash,
      current.encryptedBlobPath ?? createBlobPath(),
      Date.now(),
      current.expiresAt,
    );
    const session = authorization.session;
    const expiresAt = signedExpiry(server.config, session.expiresAt);
    const operation = await server.blobs.authorizeUpload(
      session.encryptedBlobPath!,
      expiresAt,
      MAX_ENVELOPE_BYTES,
    );
    await server.cleanup.schedule(sessionId, session.expiresAt);
    return json({
      method: operation.method,
      url: operation.url,
      headers: operation.headers,
      expiresAt: operation.expiresAt,
      maximumSize: MAX_ENVELOPE_BYTES,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
