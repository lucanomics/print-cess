# Preview provisioning scripts

Operator tooling for standing up the **Preview** Railway provider stack and
pointing the Vercel Preview environment at it. These scripts do not touch
Production: `set-vercel-preview-env.mjs` only ever writes `target: ["preview"]`,
and nothing here promotes or deploys to Production.

## Prerequisites

Network egress to `backboard.railway.app` and `api.vercel.com` must be allowed
from wherever you run these. In a restricted Claude Code environment those hosts
may be blocked by the organization egress policy (the proxy returns `403` on
CONNECT); run the scripts from an environment that can reach them, or have the
hosts added to the allow-list.

Tokens are read from the environment, never from arguments (arguments leak into
shell history and the process list):

| Variable        | Scope                                                    |
| --------------- | -------------------------------------------------------- |
| `RAILWAY_TOKEN` | Railway account or project token for the Preview project |
| `VERCEL_TOKEN`  | Vercel token with env permission on the target project   |

## Order of operations

### 1. Generate the application secrets

```bash
node scripts/provisioning/generate-preview-secrets.mjs --out preview-values.json
```

Writes `KIOSK_REGISTRATION_SECRET`, `ADMIN_DIAGNOSTICS_SECRET`, and
`CLEANUP_WORKER_SECRET` (43 chars each, mutually distinct) to a mode-600 file.
Values are never printed.

### 2. Provision Railway Preview resources

Create a **Preview-only** Railway project/environment first, then:

```bash
RAILWAY_TOKEN=... node scripts/provisioning/provision-railway-preview.mjs --list-projects
RAILWAY_TOKEN=... node scripts/provisioning/provision-railway-preview.mjs \
  --project <projectId> --environment <environmentId> --out railway-values.json
```

This reads the Redis service's TLS connection URL. The script **refuses a
non-TLS URL** because the application rejects anything that is not `rediss://`.

Railway's S3-compatible bucket is created from the dashboard (it has no stable
public creation mutation). Create it **private**, then paste `S3_ENDPOINT`,
`S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, and `S3_SECRET_ACCESS_KEY` into
`railway-values.json`.

### 3. Merge the values

Combine the two files plus the Preview origin into one JSON object containing:

```
PUBLIC_BASE_URL, ALLOWED_ORIGINS,
REDIS_URL, S3_ENDPOINT, S3_REGION, S3_BUCKET,
S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY,
KIOSK_REGISTRATION_SECRET, ADMIN_DIAGNOSTICS_SECRET, CLEANUP_WORKER_SECRET
```

`PUBLIC_BASE_URL` must be the **exact HTTPS origin** of the Preview deployment
(no path, query, or fragment).

### 4. Inject the Vercel Preview environment

```bash
VERCEL_TOKEN=... node scripts/provisioning/set-vercel-preview-env.mjs \
  --project <projectId> --team <teamId> --input preview-values.json \
  --branch preview/provider-validation --dry-run
```

Review the masked dry-run output, then re-run without `--dry-run`. The script
adds the provider selectors and TTL/demo settings automatically, marks
credentials as `sensitive`, and scopes everything to Preview (optionally to a
single git branch so unrelated PRs do not inherit the credentials).

It validates every value against the same rules the server enforces and refuses
to write if any fail — non-TLS Redis, wildcard or non-exact origins, missing S3
variables, weak or duplicated secrets, or a non-HTTPS S3 endpoint.

### 5. Deploy and verify

Redeploy the Preview branch, then confirm the runtime config gate passes
(`/api/admin/health` with the admin secret) and exercise the synthetic
session/upload/cleanup flow. Deploy `apps/cleanup-worker` as a Railway service
with `CLEANUP_ENDPOINT` set to the Preview `/api/cleanup` and the same
`CLEANUP_WORKER_SECRET`.

### 6. Clean up

Delete `preview-values.json` and `railway-values.json` once the variables are
set. They are credentials at rest. Never commit them — the repository's
`.gitignore` should be checked before writing them inside the working tree;
prefer a path outside the repository.

## Security notes

- Nothing here prints a token, Redis URL, S3 secret, or signed URL; reporting is
  masked (`length N, value=[REDACTED]`, host partially masked).
- Preview and Production must use **separate** Redis, bucket, and secrets. Never
  copy Production credentials into Preview.
- Rotate anything that was displayed or shared during setup.
