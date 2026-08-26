import type { PairingRecord, PairingShape } from "@print-cess/protocol";

import { ServiceError } from "../errors";

/**
 * Missing, expired, and wrong-shape attempts have one answer. Revealing which
 * half matched would turn the four shapes into an oracle over the 100 codes.
 */
export function pairingNotFound(): ServiceError {
  return new ServiceError(
    "not_found",
    "Those numbers and that shape do not match a transfer.",
    404,
  );
}

export function requireLive(pairing: PairingRecord | null, now: number): PairingRecord {
  if (!pairing || pairing.expiresAt <= now) throw pairingNotFound();
  return pairing;
}

export function requireShape(pairing: PairingRecord, shape: PairingShape): PairingRecord {
  if (pairing.shape !== shape) throw pairingNotFound();
  return pairing;
}
