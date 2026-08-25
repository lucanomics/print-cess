import type { PairingRecord } from "@print-cess/protocol";
import type { QueryResult, QueryResultRow } from "pg";
import { describe, expect, it } from "vitest";

import type { PostgresExecutor, PostgresQueryClient } from "../session-store/postgres-client";
import { RailwayPostgresPairingStore } from "./postgres";

const TRANSFER_CODE = "23456789ABCD";

function draft(now = 1_000): Omit<PairingRecord, "code"> {
  return {
    protocolVersion: 1,
    shape: "star",
    transferCode: TRANSFER_CODE,
    createdAt: now,
    expiresAt: now + 180_000,
  };
}

describe("RailwayPostgresPairingStore", () => {
  it("commits a wrong-shape deletion instead of rolling it back", async () => {
    const database = new FakePostgresExecutor();
    const store = new RailwayPostgresPairingStore(database);
    await store.claim(draft(), ["42"]);

    await expect(store.redeem("42", "circle", 1_000)).rejects.toThrow(
      "Those numbers and that shape do not match a transfer.",
    );
    await expect(store.redeem("42", "star", 1_000)).rejects.toThrow(
      "Those numbers and that shape do not match a transfer.",
    );
    expect(database.rollbackCount).toBe(0);
  });
});

type PairingRow = { pairing: unknown; expires_at: string | number };

class FakePostgresExecutor implements PostgresExecutor {
  private rows = new Map<string, PairingRow>();
  public rollbackCount = 0;

  public async transaction<T>(
    _sessionId: string,
    action: (client: PostgresQueryClient) => Promise<T>,
  ): Promise<T> {
    const before = structuredClone(this.rows);
    try {
      return await action({ query: (text, values) => this.run(text, values) });
    } catch (error) {
      this.rows = before;
      this.rollbackCount += 1;
      throw error;
    }
  }

  public async query<R extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: readonly unknown[],
  ): Promise<QueryResult<R>> {
    return this.run<R>(text, values);
  }

  private async run<R extends QueryResultRow = QueryResultRow>(
    text: string,
    values: readonly unknown[] = [],
  ): Promise<QueryResult<R>> {
    const normalized = text.replace(/\s+/gu, " ").trim();
    if (normalized.startsWith("CREATE TABLE IF NOT EXISTS")) return result([]);
    if (normalized.startsWith("DELETE FROM print_cess_pairing_state_v1 WHERE expires_at")) {
      const now = Number(values[0]);
      for (const [code, row] of this.rows) {
        if (Number(row.expires_at) <= now) this.rows.delete(code);
      }
      return result([]);
    }
    if (normalized.startsWith("INSERT INTO print_cess_pairing_state_v1")) {
      const code = String(values[0]);
      const expiresAt = Number(values[2]);
      const existing = this.rows.get(code);
      if (existing && Number(existing.expires_at) > Number(values[3])) return result([]);
      this.rows.set(code, { pairing: JSON.parse(String(values[1])), expires_at: expiresAt });
      return result<R>([], 1);
    }
    if (normalized.startsWith("DELETE FROM print_cess_pairing_state_v1 WHERE code")) {
      const code = String(values[0]);
      const row = this.rows.get(code);
      this.rows.delete(code);
      return result(row ? [row] : []);
    }
    throw new Error(`Unexpected test query: ${normalized}`);
  }
}

function result<R extends QueryResultRow>(rows: R[], rowCount = rows.length): QueryResult<R> {
  return { rows, rowCount, command: "", oid: 0, fields: [] };
}
