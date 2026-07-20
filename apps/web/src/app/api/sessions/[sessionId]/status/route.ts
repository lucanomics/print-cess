import { after } from "next/server";

import { authenticateToken, bearerToken } from "@/server/auth";
import { cleanupSession, getRuntime } from "@/server/runtime";
import { errorResponse, json, readSessionId } from "@/server/http";
import { ServiceError } from "@/server/errors";
import { enforceRateLimit } from "@/server/rate-limit";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ sessionId: string }> }) {
  try {
    const server = getRuntime();
    const sessionId = await readSessionId(context);
    enforceRateLimit(`status:${sessionId}`, 240, 60_000);
    const session = await server.sessions.get(sessionId);
    if (!session) {
      const receipt = await server.sessions.getReceipt(sessionId);
      if (!receipt) throw new ServiceError("not_found", "The print session was not found.", 404);
      return json(receipt);
    }
    const mobile = bearerToken(request, "x-print-cess-mobile-token");
    const kiosk = bearerToken(request, "x-print-cess-kiosk-token");
    if (mobile) await authenticateToken(mobile, session.mobileTokenHash, "mobile");
    else await authenticateToken(kiosk, session.kioskTokenHash, "kiosk");
    const now = Date.now();
    const isProcessing =
      session.status === "consumed" ||
      session.status === "validating" ||
      session.status === "printing";
    const isTerminal =
      session.status === "completed" ||
      session.status === "failed" ||
      session.status === "cancelled" ||
      session.status === "expired";
    if (!isProcessing && !isTerminal && session.expiresAt <= now) {
      after(async () => {
        await cleanupSession(server, sessionId, now).catch(() => undefined);
      });
      return json({
        protocolVersion: 1,
        sessionId,
        status: "expired",
        expiresAt: session.expiresAt,
      });
    }
    return json({
      protocolVersion: 1,
      sessionId,
      status: session.status,
      expiresAt: session.expiresAt,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
