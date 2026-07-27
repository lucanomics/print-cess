import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from "pg";

const TABLE_NAME = "print_cess_preview_state_v1";
const CONNECT_TIMEOUT_MS = 10_000;
const IDLE_TIMEOUT_MS = 30_000;
const MAX_POOL_SIZE = 4;

export interface PostgresQueryClient {
  query<R extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: readonly unknown[],
  ): Promise<QueryResult<R>>;
}

export interface PostgresExecutor {
  transaction<T>(
    sessionId: string,
    action: (client: PostgresQueryClient) => Promise<T>,
  ): Promise<T>;
  query<R extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: readonly unknown[],
  ): Promise<QueryResult<R>>;
}

const executors = new Map<string, NodePostgresExecutor>();

export function createPostgresExecutor(
  environment: NodeJS.ProcessEnv = process.env,
): PostgresExecutor {
  const url = environment.POSTGRES_URL;
  if (!url) {
    throw new Error("POSTGRES_URL is required for the railway-postgres session provider");
  }
  const ca = environment.POSTGRES_CA_CERT;
  if (!ca) {
    throw new Error("POSTGRES_CA_CERT is required for the railway-postgres session provider");
  }
  assertPemCertificate(ca);
  assertPostgresUrl(url);
  const cached = executors.get(url);
  if (cached) return cached;
  const executor = new NodePostgresExecutor(url, ca);
  executors.set(url, executor);
  return executor;
}

class NodePostgresExecutor implements PostgresExecutor {
  readonly #pool: Pool;
  readonly #ready: Promise<void>;

  public constructor(url: string, ca: string) {
    this.#pool = new Pool({
      connectionString: url,
      connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
      idleTimeoutMillis: IDLE_TIMEOUT_MS,
      max: MAX_POOL_SIZE,
      ssl: {
        ca,
        rejectUnauthorized: true,
        // Railway's database certificate is issued for localhost while the
        // external TCP proxy supplies a generated hostname. Pin the database's
        // private root CA instead of disabling certificate-chain verification.
        checkServerIdentity: () => undefined,
      },
    });
    this.#pool.on("error", () => {});
    this.#ready = this.ensureSchema();
  }

  public async transaction<T>(
    sessionId: string,
    action: (client: PostgresQueryClient) => Promise<T>,
  ): Promise<T> {
    await this.#ready;
    const client = await this.#pool.connect().catch((error: unknown) => {
      throw connectionError(error);
    });
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [sessionId]);
      const result = await action(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await rollbackQuietly(client);
      throw error;
    } finally {
      client.release();
    }
  }

  public async query<R extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: readonly unknown[],
  ): Promise<QueryResult<R>> {
    await this.#ready;
    return this.#pool.query<R>(text, values as unknown[] | undefined).catch((error: unknown) => {
      throw connectionError(error);
    });
  }

  private async ensureSchema(): Promise<void> {
    await this.#pool
      .query(
        `
        CREATE TABLE IF NOT EXISTS ${TABLE_NAME} (
          session_id TEXT PRIMARY KEY,
          session JSONB,
          retention_expires_at BIGINT,
          orphan JSONB,
          orphan_due_at BIGINT,
          receipt JSONB,
          receipt_expires_at BIGINT,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          CHECK ((orphan IS NULL) = (orphan_due_at IS NULL)),
          CHECK ((receipt IS NULL) = (receipt_expires_at IS NULL))
        )
      `,
      )
      .catch((error: unknown) => {
        throw connectionError(error);
      });
    await this.#pool
      .query(
        `
        CREATE INDEX IF NOT EXISTS print_cess_preview_orphan_due_v1
        ON ${TABLE_NAME} (orphan_due_at, session_id)
        WHERE orphan IS NOT NULL
      `,
      )
      .catch((error: unknown) => {
        throw connectionError(error);
      });
  }
}

export const POSTGRES_STATE_TABLE = TABLE_NAME;

function assertPostgresUrl(raw: string): void {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("POSTGRES_URL must be a valid PostgreSQL connection URL");
  }
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    throw new Error("POSTGRES_URL must use the postgres:// or postgresql:// protocol");
  }
  if (!url.hostname || url.hostname === "localhost" || url.hostname === "127.0.0.1") {
    throw new Error("POSTGRES_URL must target a remote TLS-enabled PostgreSQL host");
  }
}

function assertPemCertificate(value: string): void {
  if (
    !/^-----BEGIN CERTIFICATE-----\n(?:[A-Za-z0-9+/=]+\n)+-----END CERTIFICATE-----\n?$/u.test(
      value,
    )
  ) {
    throw new Error("POSTGRES_CA_CERT must contain one PEM-encoded certificate");
  }
}

async function rollbackQuietly(client: PoolClient): Promise<void> {
  try {
    await client.query("ROLLBACK");
  } catch {
    // Preserve the original error and never include the credential-bearing URL.
  }
}

function connectionError(error: unknown): Error {
  return new Error(`PostgreSQL connection failed: ${classifyError(error)}`);
}

function classifyError(error: unknown): string {
  if (error && typeof error === "object" && "code" in error && typeof error.code === "string") {
    return error.code;
  }
  if (error instanceof Error) return error.name;
  return "unknown";
}

export function resetPostgresExecutorsForTest(): void {
  executors.clear();
}
