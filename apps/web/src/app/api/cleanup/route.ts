import { z } from "zod";

import { SESSION_ID_PATTERN } from "@print-cess/protocol";

import { verifyQStashRequest } from "@/server/cleanup/qstash";
import { cleanupSession, getRuntime, sweepDueOrphans } from "@/server/runtime";
import { errorResponse, json, readBoundedText } from "@/server/http";
import { ServiceError } from "@/server/errors";
import { secretMatches } from "@/server/auth";

const cleanupSchema = z.union([
  z
    .object({
      sessionId: z.string().regex(SESSION_ID_PATTERN),
      force: z.boolean().optional(),
    })
    .strict(),
  z
    .object({ sweep: z.literal(true), limit: z.number().int().min(1).max(100).default(25) })
    .strict(),
]);

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const server = getRuntime();
    const body = await readBoundedText(request);

    const adminAuthorized = secretMatches(
      request.headers.get("x-admin-secret"),
      process.env.ADMIN_DIAGNOSTICS_SECRET,
    );

    // Authorization is branched strictly by the configured cleanup provider so
    // that enabling one path never loosens another. `sweepAuthorized` covers
    // the periodic due-orphan sweep; targeted/forced cleanup needs `admin`.
    let sweepAuthorized = adminAuthorized;
    let qstashAuthorized = false;

    if (server.config.mode === "external") {
      if (server.config.cleanupProvider === "railway-worker") {
        const workerAuthorized = secretMatches(
          request.headers.get("x-cleanup-worker-secret"),
          process.env.CLEANUP_WORKER_SECRET,
        );
        sweepAuthorized = adminAuthorized || workerAuthorized;
      } else {
        qstashAuthorized = await verifyQStashRequest(request, body);
        sweepAuthorized = adminAuthorized || qstashAuthorized;
      }
      if (!sweepAuthorized) {
        throw new ServiceError("unauthorized", "Cleanup authorization failed.", 401);
      }
    } else {
      // Local development: if an admin secret is set it must match; otherwise
      // the loopback endpoint stays open for the in-process scheduler.
      if (process.env.ADMIN_DIAGNOSTICS_SECRET && !adminAuthorized) {
        throw new ServiceError("unauthorized", "Cleanup authorization failed.", 401);
      }
      sweepAuthorized = true;
    }

    let decoded: unknown;
    try {
      decoded = JSON.parse(body);
    } catch {
      throw new ServiceError("bad_request", "Cleanup request is invalid.", 400);
    }
    const parsed = cleanupSchema.safeParse(decoded);
    if (!parsed.success) throw new ServiceError("bad_request", "Cleanup request is invalid.", 400);

    if ("sweep" in parsed.data) {
      if (!sweepAuthorized) {
        throw new ServiceError("unauthorized", "Cleanup authorization failed.", 401);
      }
      const result = await sweepDueOrphans(server, Date.now(), parsed.data.limit);
      return json({ ok: true, ...result });
    }

    // Targeted cleanup of a single session is never granted by the worker
    // secret; only QStash (single-session delivery) or an administrator may
    // trigger it, and forced cleanup always requires the administrator.
    const targetedAuthorized = adminAuthorized || qstashAuthorized;
    if (server.config.mode === "external" && !targetedAuthorized) {
      throw new ServiceError(
        "unauthorized",
        "Targeted cleanup requires administrator authorization.",
        401,
      );
    }
    if (parsed.data.force && !adminAuthorized) {
      throw new ServiceError(
        "unauthorized",
        "Forced cleanup requires administrator authorization.",
        401,
      );
    }
    const current = parsed.data.force ? await server.sessions.get(parsed.data.sessionId) : null;
    const cleanupAt = current
      ? Math.max(Date.now(), current.expiresAt, current.consumeLeaseExpiresAt ?? 0)
      : Date.now();
    const outcome = await cleanupSession(server, parsed.data.sessionId, cleanupAt);
    return json({ ok: true, outcome });
  } catch (error) {
    return errorResponse(error);
  }
}
