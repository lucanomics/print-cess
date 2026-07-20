import { authenticateToken, bearerToken } from "@/server/auth";
import { getRuntime } from "@/server/runtime";
import { assertAllowedOrigin, errorResponse, json, readSessionId } from "@/server/http";
import { ServiceError } from "@/server/errors";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ sessionId: string }> }) {
  try {
    const server = getRuntime();
    assertAllowedOrigin(request, server.config);
    const sessionId = await readSessionId(context);
    const current = await server.sessions.get(sessionId);
    if (!current) throw new ServiceError("not_found", "The print session was not found.", 404);
    const tokenHash = await authenticateToken(
      bearerToken(request, "x-print-cess-mobile-token"),
      current.mobileTokenHash,
      "mobile",
    );
    const session = await server.sessions.markUploading(sessionId, tokenHash, Date.now());
    return json({ sessionId, status: session.status, expiresAt: session.expiresAt });
  } catch (error) {
    return errorResponse(error);
  }
}
