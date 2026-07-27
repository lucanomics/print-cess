# Railway provider adapters

This document describes the Railway-based provider stack that can replace the
default Upstash/Vercel/QStash providers for the `@print-cess/web` external
adapter mode. It covers the architecture, configuration, a Preview deployment
runbook, rollback, the Production gate, credential rotation, and worker failure
recovery.

> Scope: this is a **code migration**. It does not create Railway resources,
> set Vercel environment variables, or perform any Production deployment. Those
> remain manual, gated actions.

## Architecture

The web app depends only on three provider interfaces (`apps/web/src/server/contracts.ts`):

- `SessionStore` — session lifecycle, atomic CAS, orphan ledger, receipts.
- `BlobTransport` — presigned direct upload/download, HEAD, delete.
- `CleanupScheduler` — schedules delayed cleanup of a session's blob.

`loadConfig` selects a concrete implementation per interface, and `getRuntime`
wires them. Providers are chosen explicitly and independently:

| Interface        | Env selector                  | Default         | Railway option(s)                   |
| ---------------- | ----------------------------- | --------------- | ----------------------------------- |
| SessionStore     | `PRINT_CESS_SESSION_PROVIDER` | `upstash-redis` | `railway-redis`, `railway-postgres` |
| BlobTransport    | `PRINT_CESS_BLOB_PROVIDER`    | `vercel-blob`   | `railway-s3`                        |
| CleanupScheduler | `PRINT_CESS_CLEANUP_PROVIDER` | `qstash`        | `railway-worker`                    |

Selection is per-interface, so the stacks can be mixed and migrated one provider
at a time. In `local` development mode the selectors are ignored and the
in-memory/local implementations are used unchanged.

### Railway Redis session store (`session-store/redis.ts`)

Uses the official `redis` (node-redis) client via an injected
`RedisScriptClient` port (`session-store/redis-client.ts`). The Lua scripts and
CAS/orphan/TTL/lease semantics are byte-for-byte identical to the Upstash store,
so the atomicity guarantees are unchanged. The client:

- requires a `rediss://` (TLS) `REDIS_URL`; a non-TLS URL fails config
  validation and certificate verification is never disabled;
- caches one connection per URL for reuse across serverless invocations;
- uses a bounded reconnect backoff and a connect timeout;
- reduces connection errors to a coarse, credential-free class (the URL embeds a
  password and must never be logged).

The `RedisScriptClient` port also makes the store unit-testable without a live
server.

### Railway PostgreSQL session store (`session-store/postgres.ts`)

Uses the official `pg` client and an isolated
`print_cess_preview_state_v1` table. This option exists for a no-additional-
resource Preview deployment that reuses an already approved Railway PostgreSQL
database. A transaction and per-session advisory lock protect each lifecycle
transition, while a partial due-time index supports bounded orphan sweeps.
Connections require a remote `postgres://` or `postgresql://` URL and verify
TLS certificates.

Reusing a database is a Preview-only cost optimization, not Production
isolation. The database owner must explicitly approve the new table and
cross-project Vercel credential before it is connected. Production still
requires a separately scoped store and acceptance evidence.

### Railway S3 blob transport (`blob/s3.ts`)

Uses `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` against a **private**
bucket. Presigned `PUT`/`GET`, plus `HEAD`/`DELETE`. Preserved properties:

- uploads are `application/octet-stream` only and carry an `If-None-Match: *`
  precondition so an object cannot be overwritten;
- signed-URL TTL is capped at the configured `SIGNED_URL_TTL_SECONDS` bound;
- blob key/pathname validation (`ENCRYPTED_BLOB_PATH_PATTERN`) is enforced;
- ETags are normalized (weak-validator prefix and quotes stripped) for stable
  storage and comparison;
- delete is ETag-guarded via a HEAD check and is idempotent when absent;
- credentials and the endpoint are never included in error messages.

Virtual-hosted addressing is the default; set `S3_FORCE_PATH_STYLE=true` only if
the bucket requires path-style.

**Known blocker / semantic note.** S3 presigned `PUT` cannot enforce a maximum
byte size at the edge the way Vercel Blob's delegated token does. Size is
therefore enforced at completion (the recorded `HEAD` size against
`MAX_ENVELOPE_BYTES`), not during the direct `PUT`. Overwrite prevention relies
on `If-None-Match: *`; if a specific Railway bucket does not honor that
precondition it must be verified in Preview before Production — do not silently
weaken no-overwrite semantics.

### Railway cleanup worker

Two parts:

1. `cleanup/persistent-sweep.ts` — a `PersistentSweepCleanupScheduler` whose
   `schedule()` is intentionally inert. In the QStash model each authorization
   publishes a delayed remote message; with a persistent worker that is
   unnecessary because the due time is already persisted transactionally in the
   Redis orphan sorted set by `authorizeUpload` (and refreshed on every
   `prepareCleanup` defer). The worker polls the durable ledger, so the record —
   not a remote message — is the single source of truth. This is safe across
   worker restarts, idempotent for duplicate sweeps, and safe with multiple
   worker instances because each `cleanupSession` is an atomic CAS operation.

2. `apps/cleanup-worker` — a standalone, production-buildable TypeScript process
   (`node dist/index.js`) that periodically calls `POST /api/cleanup` with
   `{ "sweep": true, "limit": CLEANUP_BATCH_SIZE }` and the
   `x-cleanup-worker-secret` header. It runs one cycle at a time (no overlapping
   polls), backs off with jittered exponential delay capped at 60s on failure,
   treats any non-2xx as a failure, shuts down gracefully on SIGTERM/SIGINT, and
   logs only timestamps, HTTP status, and sweep counts — never the secret,
   endpoint query, or response bodies. When Vercel Preview Deployment Protection
   is enabled, `VERCEL_AUTOMATION_BYPASS_SECRET` adds the narrowly scoped
   `x-vercel-protection-bypass` header without disabling protection.

### `/api/cleanup` authorization

Authorization is branched strictly by `PRINT_CESS_CLEANUP_PROVIDER` so enabling
one path never loosens another:

- `railway-worker`: a constant-time `x-cleanup-worker-secret` (distinct from
  `ADMIN_DIAGNOSTICS_SECRET`) authorizes **sweeps only**.
- `qstash`: a verified QStash signature authorizes sweeps and single-session
  delivery.
- Targeted single-session cleanup requires QStash (single delivery) or the admin
  secret; the worker secret never authorizes it.
- Forced cleanup (`force: true`) always requires the admin secret.
- The strict Zod schema and request-body size limit are unchanged.

## Configuration

See `.env.example`. For the full Railway stack in external mode:

```
PRINT_CESS_ADAPTER_MODE=external
PRINT_CESS_SESSION_PROVIDER=railway-redis
PRINT_CESS_BLOB_PROVIDER=railway-s3
PRINT_CESS_CLEANUP_PROVIDER=railway-worker

REDIS_URL=rediss://...
S3_ENDPOINT=https://...
S3_REGION=...
S3_BUCKET=...
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
CLEANUP_WORKER_SECRET=<>= 32 chars>
```

Worker process: `CLEANUP_ENDPOINT` (exact HTTPS `/api/cleanup`),
`CLEANUP_WORKER_SECRET`, and optional `CLEANUP_INTERVAL_MS` / `CLEANUP_BATCH_SIZE`
/ `CLEANUP_REQUEST_TIMEOUT_MS`. Set `VERCEL_AUTOMATION_BYPASS_SECRET` only when
the target Preview deployment uses Vercel's Protection Bypass for Automation.

For a no-additional-resource Preview that reuses an existing Railway PostgreSQL
database and Vercel Private Blob store:

```
PRINT_CESS_ADAPTER_MODE=external
PRINT_CESS_SESSION_PROVIDER=railway-postgres
PRINT_CESS_BLOB_PROVIDER=vercel-blob
PRINT_CESS_CLEANUP_PROVIDER=railway-worker

POSTGRES_URL=postgresql://...
BLOB_READ_WRITE_TOKEN=...
CLEANUP_WORKER_SECRET=<>= 32 chars>
```

This mixed stack creates no Redis or S3 service. It still needs a dedicated
table in the approved database, an existing private Blob connection, and
Preview-scoped credentials.

Config fails closed: the selected providers' variables are required, unused
provider credentials are never demanded, and Preview/Production reject non-exact
origins, non-TLS Redis, missing S3 variables, or a weak worker secret.

## Preview Railway deployment runbook

Operator scripts for steps 1–3 live in `scripts/provisioning/` (see its README):
`generate-preview-secrets.mjs` mints the three application secrets,
`provision-railway-preview.mjs` reads the Railway Redis TLS URL, and
`set-vercel-preview-env.mjs` injects the Preview environment. The last one
validates every value against the server-side config gate and only ever writes
`target: ["preview"]`, so Production cannot be modified by accident.

1. Prefer **Preview-only, isolated** Railway resources. For the documented
   no-additional-resource exception, reuse only an explicitly approved existing
   PostgreSQL database through the dedicated table above and an existing
   Preview Blob store; never reuse Production application secrets or document
   data.
2. Set the web Preview environment variables (selectors + `REDIS_URL` + `S3_*` +
   `CLEANUP_WORKER_SECRET` + exact HTTPS `PUBLIC_BASE_URL`/`ALLOWED_ORIGINS`).
3. Deploy the worker service from `apps/cleanup-worker` (`pnpm build`, then
   `node dist/index.js`) with `CLEANUP_ENDPOINT` pointing at the Preview
   `/api/cleanup` and the same `CLEANUP_WORKER_SECRET`.
4. Verify build success, then run the synthetic provider/E2E checks. Confirm a
   direct browser `PUT` and kiosk `GET`, method/path/expiry/content/size/ETag
   restrictions, claim/consume/cleanup races, terminal deletion, and bounded
   orphan recovery.
5. Inspect logs for any token, signed URL, Redis URL, or object pathname leak.

## Rollback

Because providers are selected per-interface and the Upstash/Vercel/QStash
implementations are retained, rollback is a configuration change:

- Set the selector(s) back to `upstash-redis` / `vercel-blob` / `qstash` and
  restore the corresponding credentials, then redeploy.
- No code change or data migration is required to roll back an individual
  provider.

## Production gate

Production remains gated by `docs/PRODUCTION_BLOCKERS.md`: approved isolated
resources, credential-backed Preview acceptance, and manual promotion. This
migration does not open the gate.

## Credential rotation

- **Redis**: rotate the Railway Redis password, update `REDIS_URL`, redeploy.
  Connection caching means new connections pick up the new URL after redeploy.
- **S3**: issue a new access key pair scoped to the bucket, update
  `S3_ACCESS_KEY_ID`/`S3_SECRET_ACCESS_KEY`, redeploy, then revoke the old key.
- **Worker secret**: rotate `CLEANUP_WORKER_SECRET` on the web app and the
  worker service together. A brief mismatch only causes sweep 401s (retried with
  backoff); TTL and the durable orphan ledger remain the safety net.

## Worker failure and orphan recovery

If the worker is stopped or failing:

- Due orphan records remain in the Redis sorted set; no cleanup is lost.
- Redis session TTL still expires sessions; successful kiosk registration
  opportunistically sweeps a few due records as a secondary path.
- On recovery the worker resumes sweeping due items idempotently.
- An operator can force a bounded sweep at any time with an admin-authenticated
  `POST /api/cleanup { "sweep": true }`.
