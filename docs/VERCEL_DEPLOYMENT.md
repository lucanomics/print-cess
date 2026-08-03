# Vercel deployment

## Current status

The Vercel project `club-paradiso/paradiso-print-cess-web` is linked to the private GitHub
repository with Root Directory `apps/web`. A provider-backed deployment of the dedicated `preview`
branch exists and can create browser-kiosk sessions. The public Production alias still points to an
older deployment without Production provider variables, so it intentionally remains unavailable as
a browser kiosk until the Production gates below are closed.

Automatic `main` deployments are disabled in `apps/web/vercel.json`. Do not remove that circuit
breaker until provider approval, isolated Production Blob/session/cleanup resources, environment
variables, and the manual provider suite are ready. Preview credentials must never be copied into
Production. The local adapter remains the tested development baseline.

Only the Next.js application is deployable to Vercel. When `ENABLE_BROWSER_KIOSK=true`, the public
root redirects to `/kiosk`, which creates sessions through `/api/kiosk/sessions`; this flag does not
enable `/demo/admin` or administrator diagnostics. The optional Windows kiosk is never deployed to
Vercel.
`apps/web/vercel.json` owns the Next.js commands; Vercel resolves the repository-root pnpm lockfile
and workspace packages while building from `apps/web`.

## Project setup

Keep the linked project Root Directory at `apps/web`, framework `nextjs`, install command
`pnpm install --frozen-lockfile`, build command `pnpm build`, and output directory `.next`. Disable
automatic Production deployment until all items in `PRODUCTION_BLOCKERS.md` are closed.

Using the registry-checked Vercel CLI 56.3.2:

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm dlx vercel@56.3.2 link --project paradiso-print-cess
pnpm dlx vercel@56.3.2 env pull apps/web/.env.local --environment=preview
pnpm dlx vercel@56.3.2
```

The last command creates a manual Preview only after the provider gate is ready. Do not add `--prod`.
Do not use real documents in Preview. Record the Preview URL in the Draft PR only after checking
that it does not contain tokens or signed URLs. Run the manual `Preview provider acceptance`
workflow from protected `main`; it fails closed unless the selected suite's isolated Preview
credentials and exact `PROVIDER_BASE_URL` exist. The GitHub `vercel-preview` environment is also
restricted to workflow runs whose `GITHUB_REF` is the `main` branch; the workflow repeats that
check before installing dependencies.

The expected public hostname `print-cess.vercel.app` is not approved or verified for Production.

## Environment variables

Set each value at the appropriate Vercel environment scope. Never commit real values.

| Variable                                                 | Preview                                                        | Production                                             |
| -------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------ |
| `PUBLIC_BASE_URL`                                        | Exact HTTPS Preview/stable test origin; no path/query/fragment | Exact approved HTTPS origin; no path/query/fragment    |
| `ALLOWED_ORIGINS`                                        | Comma-separated exact HTTPS Preview origins; never `*`         | Exact HTTPS Production origin(s); never `*`            |
| `PRINT_CESS_ADAPTER_MODE`                                | `external` for a hosted Preview                                | `external`                                             |
| `SESSION_TTL_SECONDS`                                    | `180`                                                          | `180`                                                  |
| `SIGNED_URL_TTL_SECONDS`                                 | At most `120` and always capped by session expiry              | Same; reduce after latency test                        |
| `ENABLE_BROWSER_KIOSK`                                   | `true` only on the dedicated kiosk Preview                     | `true` for the approved public browser kiosk           |
| `ENABLE_DEMO_ROUTES`                                     | Explicitly controlled; synthetic use only                      | `false`                                                |
| `KIOSK_REGISTRATION_SECRET`                              | Independent random value, at least 32 characters               | Independent random value, at least 32 characters       |
| `ADMIN_DIAGNOSTICS_SECRET`                               | Independent random value, at least 32 characters               | Independent random value, at least 32 characters       |
| `BLOB_STORE_ID`                                          | Preview Private Blob store                                     | Separate Production Private Blob store                 |
| `BLOB_READ_WRITE_TOKEN`                                  | Preview token, at least 20 characters                          | Separate Production token, at least 20 characters      |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`    | HTTPS Preview database URL / token at least 20 characters      | Separate HTTPS database / token at least 20 characters |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN`                  | Vercel Marketplace aliases accepted when `UPSTASH_*` is unset  | Automatically injected by the Production integration   |
| `POSTGRES_URL`                                           | Existing approved Railway PostgreSQL TLS URL when selected     | Separate approved PostgreSQL URL when selected         |
| `POSTGRES_CA_CERT`                                       | Root CA PEM for the selected Railway PostgreSQL service        | Root CA PEM for the selected Production database       |
| `UPSTASH_DISABLE_TELEMETRY`                              | `1`                                                            | `1`                                                    |
| `QSTASH_TOKEN`                                           | Preview sender token, at least 20 characters                   | Separate sender token, at least 20 characters          |
| `QSTASH_CURRENT_SIGNING_KEY` / `QSTASH_NEXT_SIGNING_KEY` | Preview receiver keys, each at least 20 characters             | Separate receiver keys, each at least 20 characters    |
| `CLEANUP_WORKER_SECRET`                                  | Shared only with the Preview Railway worker, at least 32 chars | Separate Production worker secret                      |

If Vercel Deployment Protection guards the Preview URL, configure a Protection
Bypass for Automation secret and set the same value only as
`VERCEL_AUTOMATION_BYPASS_SECRET` on the Railway cleanup worker. The web app
does not need that secret, and Deployment Protection remains enabled.

The current implementation's Production startup validation requires `BLOB_READ_WRITE_TOKEN`; an
OIDC token alone does not satisfy that gate. Restrict the token to the project/store, rotate it,
and never return it to a phone or kiosk. Vercel can supply `VERCEL_OIDC_TOKEN` in supported
deployments, but moving to OIDC-only Blob authentication requires an explicit configuration/code
change plus Preview verification before the long-lived token can be removed. Never manually copy
an ephemeral OIDC token into an environment variable.

Preview and Production must use different Blob stores, Redis databases, QStash configuration,
registration/admin credentials, base URLs, and allowed origins. A Preview deployment must not be
able to delete or query Production resources.

Server configuration rejects `PRINT_CESS_ADAPTER_MODE=local` whenever `NODE_ENV=production`; this
includes Vercel Preview and Production runtimes. The local adapter is limited to development/tests,
not a credential-free hosted fallback. In that runtime, startup also rejects non-exact/non-HTTPS
public or allowed origins, a non-HTTPS Redis URL, missing provider credentials, registration/admin
secrets shorter than 32 characters, or Blob/Redis/QStash values shorter than 20 characters. These
are fail-closed shape checks, not proof that a credential has the intended scope or provider access.

## Private Blob signed URL contract

The implementation pins `@vercel/blob` 2.6.1. Its published API supports:

- `issueSignedToken({ pathname, operations, validUntil, allowedContentTypes,
maximumSizeInBytes })`;
- `presignUrl(token, { access: "private", pathname, operation, validUntil, ... })`;
- `put`, `get`, `head`, and `delete` operation scopes;
- PUT content-type/size/no-overwrite constraints and DELETE `ifMatch`.

Vercel's
[signed URL documentation announcement](https://vercel.com/changelog/signed-urls-are-now-available-for-vercel-blob)
states that each URL is limited to one pathname, one operation, and an expiry. Do not replace this
flow with invented SDK methods, a wildcard pathname, a multi-operation delegation, or a client
read-write token.

For every document, the current implementation generates
`v1/<16-byte-base64url-random>.bin`. It contains no session ID or original filename and has 128 bits
of random pathname entropy. Issue a separate delegation for each operation:

```ts
const delegation = await issueSignedToken({
  pathname,
  operations: ["put"],
  validUntil,
  allowedContentTypes: ["application/octet-stream"],
  maximumSizeInBytes: 10_485_911,
});

const { presignedUrl } = await presignUrl(delegation, {
  access: "private",
  pathname,
  operation: "put",
  validUntil,
  allowedContentTypes: ["application/octet-stream"],
  maximumSizeInBytes: 10_485_911,
  addRandomSuffix: false,
  allowOverwrite: false,
});
```

`validUntil` must be no later than
`min(now + operationTimeout, session.expiresAt)`. Repeat with a new token and exactly one `get`
operation only after atomic consume; set `useCache: false`. Cleanup uses a new `delete`-only URL and
`ifMatch: encryptedBlobEtag` when known.

The phone performs the PUT directly and the kiosk performs the GET directly. Route Handlers process
only authorization/status JSON. They reject document-like content types and request bodies. The
10,485,911-byte envelope must never be base64-encoded into JSON or proxied through a function.

The upload completion request reports the expected size once. The server reads and records the
provider-authoritative ETag and size through the authenticated Blob SDK before decryption, and the kiosk
checks the direct GET response against that committed metadata. Credential-backed tests must prove
wrong path, wrong method, expiry, replay/no-overwrite, wrong content type, oversize, wrong ETag
delete, and repeated delete behavior.

Signed URLs and delegation tokens are bearer credentials. Apply `Cache-Control: no-store` to the
JSON response, `Referrer-Policy: no-referrer` to web pages, and redact the complete URL from logs,
errors, tracing, analytics, screenshots, and support tools.

## Redis

Use one short-lived protocol-versioned session record plus a revision and bounded orphan ledger.
Claim, upload authorization/completion, consume, and terminal seal/delete use Lua or an equivalent
transactional compare-and-set. Raw tokens are never stored. Session TTL is a backstop, not Blob
cleanup.

Preview integration must race at least two claimers and two consumers and demonstrate one winner,
terminal immutability, no stale revision overwrite, and safe cleanup/consume concurrency.

## QStash cleanup

Schedule delayed cleanup when upload authorization creates Blob risk, not for every idle QR. An
authorization retry attempts scheduling again; QStash uses a deterministic session-and-due-time
deduplication ID, so a failed/lost acknowledgement can be replayed without multiplying messages.
A later processing-lease deadline gets a distinct ID. Use the three-minute upper bound and include
only a pseudonymous cleanup reference. The endpoint:

- in external mode, requires either a QStash signature verified against current/next keys or the
  timing-safely checked administrator secret used for an authorized sweep;
- is POST-only with a strict small-body schema and a sweep limit of 100; Production WAF/rate policy
  remains an infrastructure gate;
- seals state and deletes Blob by expected path/ETag;
- succeeds when already delivered, already deleted, completed, or absent;
- logs a redacted result code only.

Normal terminal paths delete immediately. QStash retries and Redis TTL cover some failures. A
durable orphan record and due-time sorted set survive session loss/delete failure; the cleanup
handler can run a bounded sweep authorized by the administrator secret. The implementation seals
and finalizes cleanup atomically. Successful kiosk registration opportunistically sweeps at most
three due records in a background task, while an authorized explicit sweep is capped at 100. None
of these external-provider guarantees has been observed with approved Preview credentials, so
Production remains prohibited.

## Network and security settings

- HTTPS only; exact CORS allow-list; no wildcard credentials.
- Strict CSP and security headers as specified in `SECURITY.md`.
- CSP `connect-src` includes the exact `https://vercel.com` origin used by private Blob presigned
  operations, plus Vercel Blob delivery hosts; it does not allow `*.vercel.com`.
- Public browser kiosk enabled only with `ENABLE_BROWSER_KIOSK=true`; demo and administrator
  simulators remain disabled in Production.
- Production source maps private and provider request logging reviewed/redacted.
- Function/body/time limits chosen so only small JSON can enter a Route Handler.
- Firewall allow-list established only after the exact Vercel, Blob, Redis, and QStash hostnames are
  known. Do not broadly allow arbitrary domains.

## Preview acceptance

Before requesting Production approval:

1. Run the full synthetic API/E2E suite in Preview.
2. Verify a direct browser PUT and direct kiosk GET in network traces; function bytes remain small.
3. Exercise method/path/expiry/content/size/ETag restrictions and clock skew.
4. Race claim, consume, and cleanup.
5. Confirm terminal deletion and bounded orphan recovery during injected provider outages.
6. Inspect Vercel/Upstash logs for token, signed URL, filename, or document identifiers.
7. Confirm Preview cannot access Production resources.

## Rollback

Keep the last approved deployment immutable and record its commit. For a bad Preview, stop using
the URL and redeploy the last known-good commit. For an approved Production incident, the
authorized operator uses Vercel deployment rollback/promote controls under the protected Production
environment, rotates any exposed credentials, invalidates active sessions, and runs orphan cleanup.

Rollback cannot recover a kiosk session because private keys are intentionally ephemeral. Never
roll back protocol code while version-1 sessions from incompatible code remain active; first allow
or force them to expire. Production rollback was not exercised in this task.
