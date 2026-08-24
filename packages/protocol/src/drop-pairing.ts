import { z } from "zod";

import { DIGEST_PATTERN, P256_PUBLIC_KEY_PATTERN } from "./canonical.js";

/**
 * A pairing is the short conversation two phones have before a transfer code
 * changes hands. It exists so that the person receiving files types two digits
 * instead of twelve characters, without the two digits becoming the secret
 * that protects the files.
 *
 * The transfer code still never reaches the service. What travels through the
 * pairing is an ephemeral public key from each phone and, at the very end, the
 * transfer code sealed to the secret those two keys agree on. The service can
 * relay all of it and open none of it.
 *
 * Two digits alone are guessable — a hundred codes is nothing. What stands
 * between a guess and the files is the confirmation step: the receiving phone
 * shows a shape derived from both public keys, and the sending phone only
 * releases the code once its own human picks that same shape out of four. A
 * guesser is not standing next to the sender, so nobody picks their shape, and
 * a relay that swapped either key changes the shape on one side and not the
 * other.
 */
export const DROP_PAIRING_PROTOCOL_VERSION = 1 as const;

/** Two digits, entered on a keypad rather than read off a screen. */
export const PAIRING_CODE_LENGTH = 2;
export const PAIRING_CODE_PATTERN = /^[0-9]{2}$/u;
export const PAIRING_CODE_SPACE = 100;

/**
 * Four shapes, not more: the sending human has to find one of these on another
 * phone's screen and pick it out of a row, and a row of eight is a row people
 * stop reading. Four costs an attacker who guessed the digits a further
 * three-in-four chance of being turned away, and the attempt is visible on the
 * sender's screen either way.
 */
export const PAIRING_SHAPES = ["circle", "triangle", "square", "star"] as const;
export type PairingShape = (typeof PAIRING_SHAPES)[number];

/**
 * Long enough to walk a phone across a table, short enough that the hundred
 * available codes keep recycling. A pairing that is never confirmed simply
 * expires and frees its digits.
 */
export const PAIRING_TTL_SECONDS = 180;

/**
 * One receiver per pairing. A second phone arriving at the same two digits is
 * turned away rather than queued, so a guesser cannot sit on a code waiting
 * for the real receiver to give up.
 */
export const PAIRING_STATES = ["waiting", "joined", "delivered"] as const;
export type PairingState = (typeof PAIRING_STATES)[number];

/** The sealed transfer code: a 12-byte IV, the ciphertext, and a 16-byte tag. */
export const MAX_SEALED_CODE_LENGTH = 128;

export const pairingRecordSchema = z
  .object({
    protocolVersion: z.literal(DROP_PAIRING_PROTOCOL_VERSION),
    code: z.string().regex(PAIRING_CODE_PATTERN),
    state: z.enum(PAIRING_STATES),
    senderTokenHash: z.string().regex(DIGEST_PATTERN),
    senderPublicKey: z.string().regex(P256_PUBLIC_KEY_PATTERN),
    receiverTokenHash: z.string().regex(DIGEST_PATTERN).optional(),
    receiverPublicKey: z.string().regex(P256_PUBLIC_KEY_PATTERN).optional(),
    sealedCode: z
      .string()
      .regex(/^[A-Za-z0-9_-]+$/u)
      .max(MAX_SEALED_CODE_LENGTH)
      .optional(),
    createdAt: z.number().int().nonnegative(),
    expiresAt: z.number().int().positive(),
    revision: z.number().int().nonnegative(),
  })
  .strict()
  .refine((pairing) => pairing.expiresAt > pairing.createdAt, {
    message: "Pairing expiry must be later than creation.",
    path: ["expiresAt"],
  });

export type PairingRecord = z.infer<typeof pairingRecordSchema>;

export const createPairingRequestSchema = z
  .object({
    protocolVersion: z.literal(DROP_PAIRING_PROTOCOL_VERSION),
    senderTokenHash: z.string().regex(DIGEST_PATTERN),
    senderPublicKey: z.string().regex(P256_PUBLIC_KEY_PATTERN),
  })
  .strict();

export const joinPairingRequestSchema = z
  .object({
    protocolVersion: z.literal(DROP_PAIRING_PROTOCOL_VERSION),
    receiverTokenHash: z.string().regex(DIGEST_PATTERN),
    receiverPublicKey: z.string().regex(P256_PUBLIC_KEY_PATTERN),
  })
  .strict();

export const deliverPairingRequestSchema = z
  .object({
    sealedCode: z
      .string()
      .regex(/^[A-Za-z0-9_-]+$/u)
      .max(MAX_SEALED_CODE_LENGTH),
  })
  .strict();

/** What the sending phone is told while it waits, and nothing it did not already know. */
export type PairingSenderView = {
  protocolVersion: typeof DROP_PAIRING_PROTOCOL_VERSION;
  code: string;
  state: PairingState;
  receiverPublicKey?: string;
  expiresAt: number;
};

/**
 * What the receiving phone gets for two correct digits: the sender's public
 * key, which is public, and nothing else. The files stay unreachable until the
 * sending human picks the shape.
 */
export type PairingReceiverView = {
  protocolVersion: typeof DROP_PAIRING_PROTOCOL_VERSION;
  code: string;
  state: PairingState;
  senderPublicKey: string;
  sealedCode?: string;
  expiresAt: number;
};

export function formatPairingCode(code: string): string {
  return code.padStart(PAIRING_CODE_LENGTH, "0");
}

/** Accepts what a person actually types: spaces, and a single leading digit. */
export function normalizePairingCode(input: string): string {
  const digits = input.replace(/[^0-9]/gu, "").slice(0, PAIRING_CODE_LENGTH);
  return digits.length === PAIRING_CODE_LENGTH ? digits : digits.padStart(PAIRING_CODE_LENGTH, "0");
}
