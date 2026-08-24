import { pairingRecordSchema, type PairingRecord } from "@print-cess/protocol";

import type { PairingStore } from "../contracts";
import { createPostgresExecutor, type PostgresExecutor } from "../session-store/postgres-client";
import {
  applyDelivery,
  applyJoin,
  pairingNotFound,
  requireLive,
  requireSender,
} from "./transitions";

const TABLE_NAME = "print_cess_pairing_state_v1";

type PairingRow = { pairing: unknown; expires_at: string | number };

/**
 * Pairing storage on Railway PostgreSQL. A code is taken with a conditional
 * insert that also reclaims an expired row, so the hundred available codes
 * recycle without a sweep and two senders reaching for the same digits produce
 * one winner rather than one overwrite.
 */
export class RailwayPostgresPairingStore implements PairingStore {
  readonly #executor: PostgresExecutor;
  #schema: Promise<void> | null = null;

  public constructor(executor: PostgresExecutor = createPostgresExecutor()) {
    this.#executor = executor;
  }

  public async claim(
    pairing: Omit<PairingRecord, "code">,
    candidates: readonly string[],
  ): Promise<PairingRecord | null> {
    await this.ensureSchema();
    for (const code of candidates) {
      const record: PairingRecord = { ...pairing, code };
      const result = await this.#executor.query(
        `
        INSERT INTO ${TABLE_NAME} (code, pairing, expires_at)
        VALUES ($1, $2::jsonb, $3)
        ON CONFLICT (code) DO UPDATE
          SET pairing = EXCLUDED.pairing,
              expires_at = EXCLUDED.expires_at,
              updated_at = NOW()
          WHERE ${TABLE_NAME}.expires_at <= $4
        `,
        [code, JSON.stringify(record), pairing.expiresAt, pairing.createdAt],
      );
      if (result.rowCount === 1) return record;
    }
    return null;
  }

  public async get(code: string): Promise<PairingRecord | null> {
    await this.ensureSchema();
    const result = await this.#executor.query<PairingRow>(
      `SELECT pairing, expires_at FROM ${TABLE_NAME} WHERE code = $1`,
      [code],
    );
    const row = result.rows[0];
    if (!row) return null;
    if (Number(row.expires_at) <= Date.now()) return null;
    return parsePairing(row.pairing);
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
    await this.ensureSchema();
    await this.#executor.query(`DELETE FROM ${TABLE_NAME} WHERE code = $1`, [code]);
  }

  /**
   * One transaction per mutation, holding an advisory lock on the code, so two
   * receivers arriving together cannot interleave their read-modify-write and
   * both come away believing they joined.
   */
  private async mutate(
    code: string,
    now: number,
    decide: (current: PairingRecord) => PairingRecord,
  ): Promise<PairingRecord> {
    await this.ensureSchema();
    return this.#executor.transaction(`pairing:${code}`, async (client) => {
      const result = await client.query<PairingRow>(
        `SELECT pairing, expires_at FROM ${TABLE_NAME} WHERE code = $1 FOR UPDATE`,
        [code],
      );
      const row = result.rows[0];
      const stored = row && Number(row.expires_at) > now ? parsePairing(row.pairing) : null;
      const current = requireLive(stored, now);
      const next = decide(current);
      await client.query(
        `UPDATE ${TABLE_NAME} SET pairing = $2::jsonb, updated_at = NOW() WHERE code = $1`,
        [code, JSON.stringify(next)],
      );
      return next;
    });
  }

  private async ensureSchema(): Promise<void> {
    this.#schema ??= (async () => {
      await this.#executor.query(`
        CREATE TABLE IF NOT EXISTS ${TABLE_NAME} (
          code TEXT PRIMARY KEY,
          pairing JSONB NOT NULL,
          expires_at BIGINT NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
    })().catch((error: unknown) => {
      // A failed migration must not be cached as "done" for the process life.
      this.#schema = null;
      throw error;
    });
    return this.#schema;
  }
}

function parsePairing(value: unknown): PairingRecord {
  const decoded = typeof value === "string" ? JSON.parse(value) : value;
  const parsed = pairingRecordSchema.safeParse(decoded);
  if (!parsed.success) throw pairingNotFound();
  return parsed.data;
}
