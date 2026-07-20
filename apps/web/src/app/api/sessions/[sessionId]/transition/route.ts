import { kioskTransitionRequestSchema } from "@print-cess/protocol";

import { authenticateToken, bearerToken } from "@/server/auth";
import { cleanupSession, getRuntime } from "@/server/runtime";
import { assertAllowedOrigin, errorResponse, json, readJson, readSessionId } from "@/server/http";
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
      bearerToken(request, "x-print-cess-kiosk-token"),
      current.kioskTokenHash,
      "kiosk",
    );
    const body = await readJson(request, kioskTransitionRequestSchema);
    const session = await server.sessions.transition(sessionId, tokenHash, body.status, Date.now());
    if (body.status === "completed" || body.status === "failed") {
      await cleanupSession(server, sessionId);
    }
    return json({ sessionId, status: session.status, completedAt: session.completedAt });
  } catch (error) {
    return errorResponse(error);
  }
}
