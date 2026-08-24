import { PAIRING_CODE_PATTERN, type PairingSenderView } from "@print-cess/protocol";

import { assertAllowedOrigin, errorResponse, json } from "@/server/http";
import { enforceRateLimit } from "@/server/rate-limit";
import { clientAddress } from "@/server/request-identity";
import { getRuntime } from "@/server/runtime";
import {
  pairingNotFound,
  pairingTokenHash,
  requireLive,
  requireSender,
} from "@/server/pairing-store/transitions";

export const runtime = "nodejs";

/**
 * What the sending phone watches while it waits for someone to type the two
 * digits. It is answered only for the token minted when the code was claimed,
 * so the receiving side — or a guesser — cannot poll it to learn whether a
 * given pair of digits is live.
 */
export async function GET(request: Request, context: { params: Promise<{ code: string }> }) {
  try {
    const server = getRuntime();
    assertAllowedOrigin(request, server.config);
    const { code } = await context.params;
    if (!PAIRING_CODE_PATTERN.test(code)) throw pairingNotFound();
    enforceRateLimit(`pairing-watch:${clientAddress(request)}`, 240, 60_000);

    const presented = await pairingTokenHash(request.headers.get("x-print-cess-pairing-token"));
    const pairing = requireLive(await server.pairings.get(code), Date.now());
    // Compared in constant time, and answered as a miss rather than as a
    // rejection: telling a caller that the code exists but the token is wrong
    // would turn this into the oracle the two digits cannot afford.
    requireSender(pairing, presented);

    const view: PairingSenderView = {
      protocolVersion: 1,
      code: pairing.code,
      state: pairing.state,
      ...(pairing.receiverPublicKey ? { receiverPublicKey: pairing.receiverPublicKey } : {}),
      expiresAt: pairing.expiresAt,
    };
    return json(view);
  } catch (error) {
    return errorResponse(error);
  }
}

/** The sender abandoning the transfer frees the two digits immediately. */
export async function DELETE(request: Request, context: { params: Promise<{ code: string }> }) {
  try {
    const server = getRuntime();
    assertAllowedOrigin(request, server.config);
    const { code } = await context.params;
    if (!PAIRING_CODE_PATTERN.test(code)) throw pairingNotFound();
    enforceRateLimit(`pairing-drop:${clientAddress(request)}`, 30, 60_000);

    const presented = await pairingTokenHash(request.headers.get("x-print-cess-pairing-token"));
    const pairing = await server.pairings.get(code);
    if (pairing) {
      requireSender(pairing, presented);
      await server.pairings.remove(code);
    }
    return new Response(null, { status: 204 });
  } catch (error) {
    return errorResponse(error);
  }
}
