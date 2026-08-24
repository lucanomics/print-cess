import {
  joinPairingRequestSchema,
  PAIRING_CODE_PATTERN,
  type PairingReceiverView,
} from "@print-cess/protocol";

import { assertAllowedOrigin, errorResponse, json, readJson } from "@/server/http";
import { pairingNotFound } from "@/server/pairing-store/transitions";
import { assertUnderRateLimit, enforceRateLimit } from "@/server/rate-limit";
import { clientAddress } from "@/server/request-identity";
import { getRuntime } from "@/server/runtime";

export const runtime = "nodejs";

/**
 * Two digits buy exactly one thing: the sender's ephemeral public key, which is
 * public. No file list, no size, no sender identity, and no transfer code. What
 * the receiving phone does with the key is show its human a shape; the files
 * stay unreachable until the sending human picks that shape.
 *
 * The rate limit here is the one that matters. A hundred codes is a keyspace a
 * script could walk in a second, so this endpoint is deliberately the slowest
 * one in the service.
 */
export async function POST(request: Request, context: { params: Promise<{ code: string }> }) {
  try {
    const server = getRuntime();
    assertAllowedOrigin(request, server.config);
    const { code } = await context.params;
    if (!PAIRING_CODE_PATTERN.test(code)) throw pairingNotFound();
    // Two budgets doing different jobs: a generous one so no single address
    // can flood the endpoint, and a strict one that only misses pay into, so a
    // shared address is rationed by wrong guesses rather than by use.
    const address = clientAddress(request);
    enforceRateLimit(`pairing-join:${address}`, 120, 60_000);
    assertUnderRateLimit(`pairing-miss:${address}`, 10, 60_000);

    const body = await readJson(request, joinPairingRequestSchema, 4096);
    let pairing;
    try {
      pairing = await server.pairings.join(
        code,
        {
          receiverTokenHash: body.receiverTokenHash,
          receiverPublicKey: body.receiverPublicKey,
        },
        Date.now(),
      );
    } catch (error) {
      enforceRateLimit(`pairing-miss:${address}`, 10, 60_000);
      throw error;
    }

    const view: PairingReceiverView = {
      protocolVersion: 1,
      code: pairing.code,
      state: pairing.state,
      senderPublicKey: pairing.senderPublicKey,
      expiresAt: pairing.expiresAt,
    };
    return json(view, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
