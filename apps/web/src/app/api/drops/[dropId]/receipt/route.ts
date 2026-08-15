import { ServiceError } from "@/server/errors";
import { assertAllowedOrigin, errorResponse, json, readDropId } from "@/server/http";
import { enforceRateLimit } from "@/server/rate-limit";
import { clientAddress } from "@/server/request-identity";
import { getRuntime } from "@/server/runtime";

export const runtime = "nodejs";

/**
 * The receiving phone reporting that its own flow finished handling every file.
 *
 * This exists so the sending screen can stop claiming more than it knows. The
 * download endpoint can only observe that somebody asked for the first part;
 * whether the files ever reached the other phone's storage is something only
 * that phone can say. What it says here is the minimum that is useful: one bit,
 * with no identity, no file name, no destination app, and no device detail.
 *
 * It is deliberately unauthenticated, exactly like opening and downloading:
 * reaching it at all requires having derived the identifier from the transfer
 * code, so it tells the sender nothing that the holder of the code could not
 * already have caused by downloading.
 */
export async function POST(request: Request, context: { params: Promise<{ dropId: string }> }) {
  try {
    const server = getRuntime();
    assertAllowedOrigin(request, server.config);
    const dropId = await readDropId(context);
    enforceRateLimit(`drop-receipt-ip:${clientAddress(request)}`, 60, 60_000);
    enforceRateLimit(`drop-receipt:${dropId}`, 30, 5 * 60_000);

    const drop = await server.drops.get(dropId);
    if (!drop || drop.status !== "ready") {
      throw new ServiceError("not_found", "This transfer was not found.", 404);
    }
    await server.drops.recordReceiverEvent(dropId, "delivered", Date.now());
    return json({ dropId, recorded: true });
  } catch (error) {
    return errorResponse(error);
  }
}
