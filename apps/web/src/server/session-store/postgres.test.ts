import type { PrintSession } from "@print-cess/protocol";
import type { QueryResult, QueryResultRow } from "pg";
import { describe, expect, it } from "vitest";

import type { BlobOrphanRecord, SessionReceipt } from "../contracts";
import {
  createPostgresExecutor,
  type PostgresExecutor,
  type PostgresQueryClient,
} from "./postgres-client";
import { RailwayPostgresSessionStore } from "./postgres";

type FakeRow = {
  session: PrintSession | null;
  retention_expires_at: number | null;
  orphan: BlobOrphanRecord | null;
  orphan_due_at: number | null;
  receipt: SessionReceipt | null;
  receipt_expires_at: number | null;
};

const SESSION_ID = "A".repeat(22);
const DIGEST = "A".repeat(43);
const validSession: PrintSession = {
  protocolVersion: 1,
  sessionId: SESSION_ID,
  status: "waiting",
  kioskPublicKey: `B${"A".repeat(86)}`,
  kioskPublicKeyFingerprint: DIGEST,
  createdAt: 1_000,
  expiresAt: 181_000,
  uploadTokenHash: DIGEST,
  kioskTokenHash: DIGEST,
  revision: 0,
};

describe("RailwayPostgresSessionStore", () => {
  it("persists the core upload and cleanup lifecycle", async () => {
    const database = new FakePostgresExecutor();
    const store = new RailwayPostgresSessionStore(database);

    await store.create(validSession, 180_000);
    await expect(store.get(SESSION_ID)).resolves.toEqual(validSession);

    const claimed = await store.claim(SESSION_ID, DIGEST, DIGEST, DIGEST, 2_000, 180_000);
    expect(claimed).toMatchObject({ status: "claimed", revision: 1 });

    const authorized = await store.authorizeUpload(
      SESSION_ID,
      DIGEST,
      DIGEST,
      `v1/${SESSION_ID}.bin`,
      3_000,
      190_000,
    );
    expect(authorized).toMatchObject({
      newlyAuthorized: true,
      session: { status: "upload_authorized", revision: 2 },
    });

    await store.markUploading(SESSION_ID, DIGEST, 4_000);
    const uploaded = await store.markUploaded(
      SESSION_ID,
      DIGEST,
      { etag: "etag-1", size: 1_024 },
      5_000,
    );
    expect(uploaded).toMatchObject({ status: "uploaded", encryptedBlobEtag: "etag-1" });

    await expect(store.listDueOrphans(190_000, 10)).resolves.toEqual([
      expect.objectContaining({ sessionId: SESSION_ID, etag: "etag-1" }),
    ]);
    await expect(store.prepareCleanup(SESSION_ID, 190_000)).resolves.toMatchObject({
      action: "delete",
      orphan: { sessionId: SESSION_ID, etag: "etag-1" },
      receiptStatus: "expired",
    });
  });

  it("fails closed when the PostgreSQL URL is absent or local", () => {
    expect(() => createPostgresExecutor({ NODE_ENV: "test" })).toThrow(/POSTGRES_URL is required/u);
    expect(() =>
      createPostgresExecutor({
        NODE_ENV: "test",
        POSTGRES_URL: "postgresql://preview:secret@postgres.example.test:5432/railway",
      }),
    ).toThrow(/POSTGRES_CA_CERT is required/u);
    expect(() =>
      createPostgresExecutor({
        NODE_ENV: "test",
        POSTGRES_URL: "postgresql://preview:secret@localhost:5432/railway",
        POSTGRES_CA_CERT:
          "-----BEGIN CERTIFICATE-----\nQUJDRA==\n-----END CERTIFICATE-----\n",
      }),
    ).toThrow(/remote TLS-enabled PostgreSQL host/u);
  });
});

class FakePostgresExecutor implements PostgresExecutor {
  readonly #rows = new Map<string, FakeRow>();

  public async transaction<T>(
    _sessionId: string,
    action: (client: PostgresQueryClient) => Promise<T>,
  ): Promise<T> {
    return action({ query: (text, values) => this.run(text, values) });
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
    if (normalized.startsWith("SELECT session, retention_expires_at")) {
      const row = this.#rows.get(String(values[0]));
      return result(row ? [structuredClone(row) as unknown as R] : []);
    }
    if (normalized.startsWith("INSERT INTO print_cess_preview_state_v1")) {
      this.#rows.set(String(values[0]), {
        session: parseJson<PrintSession>(values[1]),
        retention_expires_at: numberOrNull(values[2]),
        orphan: parseJson<BlobOrphanRecord>(values[3]),
        orphan_due_at: numberOrNull(values[4]),
        receipt: parseJson<SessionReceipt>(values[5]),
        receipt_expires_at: numberOrNull(values[6]),
      });
      return result([]);
    }
    if (normalized.startsWith("DELETE FROM print_cess_preview_state_v1 WHERE session_id")) {
      this.#rows.delete(String(values[0]));
      return result([]);
    }
    if (normalized.startsWith("UPDATE print_cess_preview_state_v1")) {
      const now = Number(values[0]);
      for (const row of this.#rows.values()) {
        if (row.retention_expires_at !== null && row.retention_expires_at <= now) {
          row.session = null;
          row.retention_expires_at = null;
        }
        if (row.receipt_expires_at !== null && row.receipt_expires_at <= now) {
          row.receipt = null;
          row.receipt_expires_at = null;
        }
      }
      return result([]);
    }
    if (normalized.startsWith("DELETE FROM print_cess_preview_state_v1 WHERE session IS NULL")) {
      for (const [sessionId, row] of this.#rows) {
        if (!row.session && !row.orphan && !row.receipt) this.#rows.delete(sessionId);
      }
      return result([]);
    }
    if (normalized.startsWith("SELECT orphan FROM print_cess_preview_state_v1")) {
      const now = Number(values[0]);
      const limit = Number(values[1]);
      const rows = [...this.#rows.entries()]
        .filter(([, row]) => row.orphan && (row.orphan_due_at ?? Number.POSITIVE_INFINITY) <= now)
        .sort(
          ([leftId, left], [rightId, right]) =>
            (left.orphan_due_at ?? 0) - (right.orphan_due_at ?? 0) || leftId.localeCompare(rightId),
        )
        .slice(0, limit)
        .map(([, row]) => ({ orphan: structuredClone(row.orphan) }) as unknown as R);
      return result(rows);
    }
    throw new Error(`Unexpected test query: ${normalized}`);
  }
}

function result<R extends QueryResultRow>(rows: R[]): QueryResult<R> {
  return { rows, rowCount: rows.length, command: "", oid: 0, fields: [] };
}

function parseJson<T>(value: unknown): T | null {
  return typeof value === "string" ? (JSON.parse(value) as T) : null;
}

function numberOrNull(value: unknown): number | null {
  return value === null || value === undefined ? null : Number(value);
}
