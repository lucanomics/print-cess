import { claimSessionRequestSchema } from "@print-cess/protocol";

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
    enforceRateLimit(`claim:${sessionId}`, 10, 60_000);
    const current = await server.sessions.get(sessionId);
    if (!current) {
      const receipt = await server.sessions.getReceipt(sessionId);
      if (receipt) {
        throw new ServiceError("expired", "The print session has expired.", 410);
      }
      throw new ServiceError("not_found", "The print session was not found.", 404);
    }
    const uploadTokenHash = await authenticateToken(
      bearerToken(request, "x-print-cess-upload-token"),
      current.uploadTokenHash,
      "upload",
    );
    const body = await readJson(request, claimSessionRequestSchema);
    const session = await server.sessions.claim(
      sessionId,
      uploadTokenHash,
      body.mobileTokenHash,
      body.claimIdHash,
      Date.now(),
      server.config.sessionTtlMs,
    );
    return json({
      protocolVersion: 1,
      sessionId,
      status: session.status,
      expiresAt: session.expiresAt,
      kioskPublicKey: session.kioskPublicKey,
      kioskPublicKeyFingerprint: session.kioskPublicKeyFingerprint,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
