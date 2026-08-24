import { PAIRING_CODE_PATTERN, type PairingReceiverView } from "@print-cess/protocol";

import { assertAllowedOrigin, errorResponse, json } from "@/server/http";
import {
  pairingNotFound,
  pairingTokenHash,
  requireLive,
  requireReceiver,
} from "@/server/pairing-store/transitions";
import { enforceRateLimit } from "@/server/rate-limit";
import { clientAddress } from "@/server/request-identity";
import { getRuntime } from "@/server/runtime";

export const runtime = "nodejs";

/**
 * What the receiving phone polls once it has shown its shape. Answered only for
 * the token minted when it joined, so the sealed envelope is handed to the
 * phone that took part in the exchange and to nothing else — and even that
 * phone gets nothing until the sending human has confirmed.
 */
export async function GET(request: Request, context: { params: Promise<{ code: string }> }) {
  try {
    const server = getRuntime();
    assertAllowedOrigin(request, server.config);
    const { code } = await context.params;
    if (!PAIRING_CODE_PATTERN.test(code)) throw pairingNotFound();
    enforceRateLimit(`pairing-sealed:${clientAddress(request)}`, 240, 60_000);

    const presented = await pairingTokenHash(request.headers.get("x-print-cess-pairing-token"));
    const pairing = requireLive(await server.pairings.get(code), Date.now());
    requireReceiver(pairing, presented);

    const view: PairingReceiverView = {
      protocolVersion: 1,
      code: pairing.code,
      state: pairing.state,
      senderPublicKey: pairing.senderPublicKey,
      ...(pairing.sealedCode ? { sealedCode: pairing.sealedCode } : {}),
      expiresAt: pairing.expiresAt,
    };
    return json(view);
  } catch (error) {
    return errorResponse(error);
  }
}
