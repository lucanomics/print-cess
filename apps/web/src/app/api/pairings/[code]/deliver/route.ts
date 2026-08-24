import { deliverPairingRequestSchema, PAIRING_CODE_PATTERN } from "@print-cess/protocol";

import { assertAllowedOrigin, errorResponse, json, readJson } from "@/server/http";
import { pairingNotFound, pairingTokenHash } from "@/server/pairing-store/transitions";
import { enforceRateLimit } from "@/server/rate-limit";
import { clientAddress } from "@/server/request-identity";
import { getRuntime } from "@/server/runtime";

export const runtime = "nodejs";

/**
 * The sending phone hands over the transfer code, sealed to the secret only the
 * two phones agreed on. This is called after the sending human picked the shape
 * the receiving phone was showing, which is the step that makes two digits safe
 * to type: a guesser who joined never gets picked, so this never runs for them.
 *
 * The service stores the envelope and cannot open it.
 */
export async function POST(request: Request, context: { params: Promise<{ code: string }> }) {
  try {
    const server = getRuntime();
    assertAllowedOrigin(request, server.config);
    const { code } = await context.params;
    if (!PAIRING_CODE_PATTERN.test(code)) throw pairingNotFound();
    enforceRateLimit(`pairing-deliver:${clientAddress(request)}`, 20, 60_000);

    const presented = await pairingTokenHash(request.headers.get("x-print-cess-pairing-token"));
    const body = await readJson(request, deliverPairingRequestSchema, 4096);
    const pairing = await server.pairings.deliver(code, presented, body.sealedCode, Date.now());
    return json({ protocolVersion: 1, state: pairing.state });
  } catch (error) {
    return errorResponse(error);
  }
}
