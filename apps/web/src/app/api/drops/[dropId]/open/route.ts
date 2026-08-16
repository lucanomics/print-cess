import type { DropOpenView, DropPendingView } from "@print-cess/protocol";

import { ServiceError } from "@/server/errors";
import { assertAllowedOrigin, errorResponse, json, readDropId } from "@/server/http";
import { enforceRateLimit } from "@/server/rate-limit";
import { clientAddress } from "@/server/request-identity";
import { getRuntime } from "@/server/runtime";

export const runtime = "nodejs";

/**
 * The receiving phone's first call, and every call it makes while waiting for a
 * sender who has not finished uploading.
 *
 * The limits come in two tiers because the two answers are worth different
 * amounts. Reaching this route at all is bounded coarsely: at a few hundred
 * guesses a minute a sixty-bit code is still unreachable by many orders of
 * magnitude, and a receiver waiting out a slow gigabyte has to be able to ask
 * repeatedly without being locked out of a transfer that is genuinely theirs —
 * which is exactly what a single tight limit did, roughly three minutes into a
 * legitimate wait.
 *
 * The tight limits are kept for the branch that actually hands out the manifest
 * ciphertext. That is the response worth rationing, and it is rationed per code
 * and per caller exactly as before.
 */
const COARSE_PER_CALLER = 240;
const COARSE_PER_DROP = 300;
const MANIFEST_PER_CALLER = 20;
const MANIFEST_PER_DROP = 30;

export async function POST(request: Request, context: { params: Promise<{ dropId: string }> }) {
  try {
    const server = getRuntime();
    assertAllowedOrigin(request, server.config);
    const dropId = await readDropId(context);
    const caller = clientAddress(request);
    enforceRateLimit(`drop-open-ip:${caller}`, COARSE_PER_CALLER, 60_000);
    enforceRateLimit(`drop-open:${dropId}`, COARSE_PER_DROP, 5 * 60_000);

    const drop = await server.drops.get(dropId);
    if (!drop) throw new ServiceError("not_found", "This transfer was not found.", 404);
    if (drop.expiresAt <= Date.now()) {
      throw new ServiceError("expired", "This transfer has expired.", 410);
    }

    // A receiver who scanned the QR while the sending phone was still
    // uploading holds the right code and should be told to wait, not that the
    // code is wrong. Somebody guessing still gets the same 404 as before,
    // because a guess almost never names a record that exists at all — and
    // this answer carries no file list, no progress, and nothing about who is
    // sending, so it adds no signal beyond the existence oracle that opening a
    // sealed transfer already provided.
    if (drop.status !== "ready") {
      const pending: DropPendingView = {
        protocolVersion: drop.protocolVersion,
        state: "collecting",
        dropId,
        expiresAt: drop.expiresAt,
      };
      return json(pending);
    }

    // Only the answer that carries ciphertext is rationed tightly.
    enforceRateLimit(`drop-manifest-ip:${caller}`, MANIFEST_PER_CALLER, 60_000);
    enforceRateLimit(`drop-manifest:${dropId}`, MANIFEST_PER_DROP, 5 * 60_000);

    const view: DropOpenView = {
      protocolVersion: drop.protocolVersion,
      state: "ready",
      dropId,
      manifest: drop.manifest,
      fileCount: drop.fileCount,
      partCount: drop.partCount,
      partSizes: drop.parts.map((part) => part?.size ?? 0),
      totalCiphertextBytes: drop.totalCiphertextBytes,
      expiresAt: drop.expiresAt,
    };
    // Recorded after the view is built so a storage hiccup can never cost the
    // receiver the transfer they correctly opened.
    await server.drops.recordReceiverEvent(dropId, "opened", Date.now()).catch(() => undefined);
    return json(view);
  } catch (error) {
    return errorResponse(error);
  }
}
