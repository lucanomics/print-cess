import { consumeSessionRequestSchema } from "@print-cess/protocol";

import { authenticateToken, bearerToken } from "@/server/auth";
import { getRuntime } from "@/server/runtime";
import { assertAllowedOrigin, errorResponse, json, readJson, readSessionId } from "@/server/http";
import { ServiceError } from "@/server/errors";
import { enforceRateLimit } from "@/server/rate-limit";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ sessionId: string }> }) {
  try {
    const server = getRuntime();
    assertAllowedOrigin(request, server.config);
    const sessionId = await readSessionId(context);
    enforceRateLimit(`consume:${sessionId}`, 10, 60_000);
    const current = await server.sessions.get(sessionId);
    if (!current?.encryptedBlobPath || !current.encryptedBlobEtag || !current.encryptedBlobSize) {
      throw new ServiceError("not_found", "The encrypted upload is not ready.", 404);
    }
    const tokenHash = await authenticateToken(
      bearerToken(request, "x-print-cess-kiosk-token"),
      current.kioskTokenHash,
      "kiosk",
    );
    const body = await readJson(request, consumeSessionRequestSchema);
    const now = Date.now();
    const session = await server.sessions.consume(
      sessionId,
      tokenHash,
      body.consumeIdHash,
      now,
      30_000,
    );
    const expiresAt = Math.min(session.consumeLeaseExpiresAt ?? now + 30_000, now + 30_000);
    const operation = await server.blobs.authorizeDownload(session.encryptedBlobPath!, expiresAt);
    return json({
      sessionId,
      status: session.status,
      method: operation.method,
      url: operation.url,
      headers: operation.headers,
      expiresAt,
      etag: session.encryptedBlobEtag,
      size: session.encryptedBlobSize,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
