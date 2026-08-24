import { fromCanonicalBase64Url, hashToken } from "@print-cess/crypto";
import type { PairingRecord } from "@print-cess/protocol";
import { timingSafeEqual } from "node:crypto";

import { ServiceError } from "../errors";

export type PairingMutation = { next: PairingRecord };

/**
 * Every wrong guess and every expired pairing is answered the same way: the two
 * digits simply do not name a transfer. Distinguishing "expired" from "never
 * existed" would tell a guesser which half of the keyspace is worth a second
 * pass.
 */
export function pairingNotFound(): ServiceError {
  return new ServiceError("not_found", "Those numbers do not match a transfer.", 404);
}

export function requireLive(pairing: PairingRecord | null, now: number): PairingRecord {
  if (!pairing || pairing.expiresAt <= now) throw pairingNotFound();
  return pairing;
}

export function requireSender(pairing: PairingRecord, senderTokenHash: string): void {
  if (!constantTimeEquals(pairing.senderTokenHash, senderTokenHash)) throw pairingNotFound();
}

export function requireReceiver(pairing: PairingRecord, receiverTokenHash: string): void {
  if (!constantTimeEquals(pairing.receiverTokenHash, receiverTokenHash)) throw pairingNotFound();
}

/**
 * Turns the raw token a phone presents into the hash the record stores. A
 * malformed token is answered with a hash that cannot match rather than an
 * early return, so the work done is the same either way.
 */
export async function pairingTokenHash(rawToken: string | null): Promise<string> {
  if (!rawToken || rawToken.length > 128) return UNMATCHABLE_HASH;
  try {
    return await hashToken(rawToken, "pairing");
  } catch {
    return UNMATCHABLE_HASH;
  }
}

const UNMATCHABLE_HASH = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

function constantTimeEquals(stored: string | undefined, candidate: string): boolean {
  if (!stored) return false;
  try {
    return timingSafeEqual(
      Buffer.from(fromCanonicalBase64Url(stored, 32)),
      Buffer.from(fromCanonicalBase64Url(candidate, 32)),
    );
  } catch {
    return false;
  }
}

/**
 * One receiver, first come. A second phone on the same two digits is turned
 * away rather than replacing the first, so a guesser cannot displace a receiver
 * who already arrived — and cannot sit on a code hoping the real one gives up,
 * because the sending human never confirms a shape they cannot see.
 */
export function applyJoin(
  pairing: PairingRecord,
  join: { receiverTokenHash: string; receiverPublicKey: string },
): PairingMutation {
  if (pairing.state !== "waiting") {
    throw new ServiceError("conflict", "Someone is already receiving this transfer.", 409);
  }
  return {
    next: {
      ...pairing,
      state: "joined",
      receiverTokenHash: join.receiverTokenHash,
      receiverPublicKey: join.receiverPublicKey,
      revision: pairing.revision + 1,
    },
  };
}

/**
 * The sending human picked the shape the receiving phone is showing. This is
 * the moment the transfer stops being reachable by anyone who merely guessed
 * the digits, so it is also the only moment the sealed code may be stored.
 */
export function applyDelivery(pairing: PairingRecord, sealedCode: string): PairingMutation {
  if (pairing.state !== "joined") {
    throw new ServiceError("conflict", "This transfer is not waiting for a receiver.", 409);
  }
  return {
    next: { ...pairing, state: "delivered", sealedCode, revision: pairing.revision + 1 },
  };
}
