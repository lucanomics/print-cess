import { authenticateToken, bearerToken } from "@/server/auth";
import { cleanupSession, getRuntime } from "@/server/runtime";
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
    const mobile = bearerToken(request, "x-print-cess-mobile-token");
    const role = mobile ? "mobile" : "kiosk";
    const hash = await authenticateToken(
      mobile ?? bearerToken(request, "x-print-cess-kiosk-token"),
      role === "mobile" ? current.mobileTokenHash : current.kioskTokenHash,
      role,
    );
    const session = await server.sessions.cancel(sessionId, hash, role, Date.now());
    await cleanupSession(server, sessionId);
    return json({ sessionId, status: session.status });
  } catch (error) {
    return errorResponse(error);
  }
}
