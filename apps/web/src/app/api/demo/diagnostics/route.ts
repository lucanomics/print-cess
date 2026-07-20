import { getRuntime } from "@/server/runtime";
import { errorResponse, json } from "@/server/http";
import { ServiceError } from "@/server/errors";
import { secretMatches } from "@/server/auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const server = getRuntime();
    if (!server.config.demoEnabled)
      throw new ServiceError("not_found", "Diagnostics are disabled.", 404);
    const expected = process.env.ADMIN_DIAGNOSTICS_SECRET;
    if (!expected)
      throw new ServiceError("unavailable", "Administrator authentication is not configured.", 503);
    if (!secretMatches(request.headers.get("x-admin-secret"), expected)) {
      throw new ServiceError("unauthorized", "Administrator authentication failed.", 401);
    }
    return json({
      adapterMode: server.config.mode,
      server: "ready",
      sessionStore: server.config.mode === "local" ? "memory-ready" : "upstash-configured",
      blob: server.config.mode === "local" ? "encrypted-local-ready" : "vercel-private-configured",
      cleanup: server.config.mode === "local" ? "in-process-ready" : "qstash-configured",
      printer: "mock-ready",
      metrics: "disabled",
    });
  } catch (error) {
    return errorResponse(error);
  }
}
