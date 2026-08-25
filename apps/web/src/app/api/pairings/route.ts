import {
  createPairingRequestSchema,
  PAIRING_CODE_SPACE,
  PAIRING_TTL_SECONDS,
  type PairingRecord,
} from "@print-cess/protocol";

import { ServiceError } from "@/server/errors";
import { assertAllowedOrigin, errorResponse, json, readJson } from "@/server/http";
import { enforceRateLimit } from "@/server/rate-limit";
import { clientAddress } from "@/server/request-identity";
import { getRuntime } from "@/server/runtime";

export const runtime = "nodejs";

/**
 * How many of the hundred codes one sender is allowed to try before being told
 * to wait. Walking the whole space would let a single phone discover which
 * codes are in use, which is exactly the map a guesser wants.
 */
const CLAIM_ATTEMPTS = 8;

export async function POST(request: Request) {
  try {
    const server = getRuntime();
    assertAllowedOrigin(request, server.config);
    // A hundred codes is the whole pool, so claiming them is bounded — but the
    // bound is per address, and a café shares one. Kept loose enough that a
    // busy counter is never the thing that runs out, and tight enough that one
    // address cannot sit on the pool.
    enforceRateLimit(`pairing-create:${clientAddress(request)}`, 30, 60_000);

    const body = await readJson(request, createPairingRequestSchema, 4096);
    const now = Date.now();
    const pairing: Omit<PairingRecord, "code"> = {
      protocolVersion: 1,
      shape: body.shape,
      transferCode: body.transferCode,
      createdAt: now,
      expiresAt: now + PAIRING_TTL_SECONDS * 1000,
    };

    const claimed = await server.pairings.claim(pairing, drawCandidates());
    if (!claimed) {
      throw new ServiceError(
        "unavailable",
        "Every short code is in use right now. Try again in a moment.",
        503,
      );
    }
    return json({ protocolVersion: 1, code: claimed.code, expiresAt: claimed.expiresAt }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * A shuffled sample rather than a scan from "00": handing out codes in order
 * would make the next one predictable, and a predictable code is one a guesser
 * can join before the person standing next to the sender does.
 */
function drawCandidates(): string[] {
  const drawn = new Set<string>();
  while (drawn.size < CLAIM_ATTEMPTS) {
    const value = crypto.getRandomValues(new Uint32Array(1))[0]! % PAIRING_CODE_SPACE;
    drawn.add(String(value).padStart(2, "0"));
  }
  return [...drawn];
}
