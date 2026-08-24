import { pairingRecordSchema, type PairingRecord } from "@print-cess/protocol";

import type { PairingStore } from "../contracts";
import { ServiceError } from "../errors";
import type { RedisScriptClient } from "../session-store/redis-client";
import {
  applyDelivery,
  applyJoin,
  pairingNotFound,
  requireLive,
  requireSender,
} from "./transitions";

const PAIRING_KEY_PREFIX = "pc:v1:pairing:";
const MAX_CAS_ATTEMPTS = 3;

/**
 * Walks the offered codes and takes the first that nobody holds. Redis expiry
 * frees a code on its own, so an abandoned pairing never has to be swept before
 * its digits can be handed out again.
 */
const CLAIM_SCRIPT = `
for index, key in ipairs(KEYS) do
  if redis.call('SET', key, ARGV[index + 1], 'PX', ARGV[1], 'NX') then
    return index
  end
end
return 0
`;

const CAS_SCRIPT = `
local current = redis.call('GET', KEYS[1])
if not current then return 0 end
local decoded = cjson.decode(current)
if tonumber(decoded.revision) ~= tonumber(ARGV[1]) then return -1 end
redis.call('SET', KEYS[1], ARGV[2], 'PX', redis.call('PTTL', KEYS[1]))
return 1
`;

/**
 * Pairing storage on any Redis that speaks EVAL. Both hosted providers reach
 * this one implementation through `RedisScriptClient`, so taking a code and
 * updating it stay atomic on Upstash and on a standard Redis server alike.
 */
export class RedisPairingStore implements PairingStore {
  public constructor(private readonly redis: RedisScriptClient) {}

  public async claim(
    pairing: Omit<PairingRecord, "code">,
    candidates: readonly string[],
  ): Promise<PairingRecord | null> {
    if (candidates.length === 0) return null;
    const ttl = Math.max(1, Math.trunc(pairing.expiresAt - pairing.createdAt));
    const records = candidates.map((code) => JSON.stringify({ ...pairing, code }));
    const taken = Number(
      await this.redis.eval(CLAIM_SCRIPT, candidates.map(pairingKey), [String(ttl), ...records]),
    );
    if (taken <= 0) return null;
    return { ...pairing, code: candidates[taken - 1]! };
  }

  public async get(code: string): Promise<PairingRecord | null> {
    const raw = await this.redis.get(pairingKey(code));
    if (!raw) return null;
    const parsed = pairingRecordSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  }

  public async join(
    code: string,
    join: { receiverTokenHash: string; receiverPublicKey: string },
    now: number,
  ): Promise<PairingRecord> {
    return this.mutate(code, now, (current) => applyJoin(current, join).next);
  }

  public async deliver(
    code: string,
    senderTokenHash: string,
    sealedCode: string,
    now: number,
  ): Promise<PairingRecord> {
    return this.mutate(code, now, (current) => {
      requireSender(current, senderTokenHash);
      return applyDelivery(current, sealedCode).next;
    });
  }

  public async remove(code: string): Promise<void> {
    await this.redis.del(pairingKey(code));
  }

  /**
   * Read, decide, write back only if nothing moved underneath. Two receivers
   * arriving together therefore produce one join and one conflict rather than
   * two joins where the second silently wins.
   */
  private async mutate(
    code: string,
    now: number,
    decide: (current: PairingRecord) => PairingRecord,
  ): Promise<PairingRecord> {
    for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt += 1) {
      const current = requireLive(await this.get(code), now);
      const next = decide(current);
      const result = Number(
        await this.redis.eval(
          CAS_SCRIPT,
          [pairingKey(code)],
          [String(current.revision), JSON.stringify(next)],
        ),
      );
      if (result === 1) return next;
      if (result === 0) throw pairingNotFound();
    }
    throw new ServiceError("conflict", "That transfer is busy. Try again.", 409);
  }
}

function pairingKey(code: string): string {
  return `${PAIRING_KEY_PREFIX}${code}`;
}
