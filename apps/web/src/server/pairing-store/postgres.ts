import { pairingRecordSchema, type PairingRecord } from "@print-cess/protocol";

import type { PairingStore } from "../contracts";
import { createPostgresExecutor, type PostgresExecutor } from "../session-store/postgres-client";
import { pairingNotFound, requireLive, requireShape } from "./transitions";

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
    // The table can hold at most one row per two-digit code, so pruning on
    // ordinary pairing traffic is bounded and keeps expired escrow out of
    // persistent storage even when its particular code is not selected next.
    await this.#executor.query(`DELETE FROM ${TABLE_NAME} WHERE expires_at <= $1`, [
      pairing.createdAt,
    ]);
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
    const now = Date.now();
    await this.#executor.query(`DELETE FROM ${TABLE_NAME} WHERE code = $1 AND expires_at <= $2`, [
      code,
      now,
    ]);
    const result = await this.#executor.query<PairingRow>(
      `SELECT pairing, expires_at FROM ${TABLE_NAME} WHERE code = $1`,
      [code],
    );
    const row = result.rows[0];
    if (!row) return null;
    return parsePairing(row.pairing);
  }

  public async redeem(
    code: string,
    shape: PairingRecord["shape"],
    now: number,
  ): Promise<PairingRecord> {
    await this.ensureSchema();
    // Return the deleted record from the transaction, then validate it after
    // COMMIT. Throwing a shape mismatch inside the callback would ROLLBACK the
    // DELETE and let a caller try the other three shapes against the same code.
    const stored = await this.#executor.transaction(`pairing:${code}`, async (client) => {
      // Delete first and inspect the returned record second. A wrong shape is
      // therefore consumed just as atomically as a correct one.
      const result = await client.query<PairingRow>(
        `DELETE FROM ${TABLE_NAME} WHERE code = $1 RETURNING pairing, expires_at`,
        [code],
      );
      const row = result.rows[0];
      return row ? parsePairing(row.pairing) : null;
    });
    return requireShape(requireLive(stored, now), shape);
  }

  public async remove(code: string): Promise<void> {
    await this.ensureSchema();
    await this.#executor.query(`DELETE FROM ${TABLE_NAME} WHERE code = $1`, [code]);
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
