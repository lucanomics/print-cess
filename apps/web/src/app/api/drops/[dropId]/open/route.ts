import type { DropOpenView } from "@print-cess/protocol";

import { ServiceError } from "@/server/errors";
import { assertAllowedOrigin, errorResponse, json, readDropId } from "@/server/http";
import { enforceRateLimit } from "@/server/rate-limit";
import { clientAddress } from "@/server/request-identity";
import { getRuntime } from "@/server/runtime";

export const runtime = "nodejs";

/**
 * The receiving phone's first call. Reaching this route already proves the
 * caller derived the identifier from the transfer code, so the rate limits here
 * are the only thing standing between a guesser and the ciphertext — they are
 * deliberately tight, per code and per caller.
 */
export async function POST(request: Request, context: { params: Promise<{ dropId: string }> }) {
  try {
    const server = getRuntime();
    assertAllowedOrigin(request, server.config);
    const dropId = await readDropId(context);
    enforceRateLimit(`drop-open-ip:${clientAddress(request)}`, 20, 60_000);
    enforceRateLimit(`drop-open:${dropId}`, 30, 5 * 60_000);

    const drop = await server.drops.get(dropId);
    if (!drop || drop.status !== "ready") {
      throw new ServiceError("not_found", "This transfer was not found.", 404);
    }
    if (drop.expiresAt <= Date.now()) {
      throw new ServiceError("expired", "This transfer has expired.", 410);
    }

    const view: DropOpenView = {
      protocolVersion: drop.protocolVersion,
      dropId,
      manifest: drop.manifest,
      fileCount: drop.fileCount,
      partCount: drop.partCount,
      partSizes: drop.parts.map((part) => part?.size ?? 0),
      totalCiphertextBytes: drop.totalCiphertextBytes,
      expiresAt: drop.expiresAt,
    };
    return json(view);
  } catch (error) {
    return errorResponse(error);
  }
}
