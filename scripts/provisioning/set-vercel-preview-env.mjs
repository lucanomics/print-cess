#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describeSecret, describeUrl, report, requireEnvironment } from "./lib/secure.mjs";

/**
 * Inject the Railway provider configuration into a Vercel project's PREVIEW
 * environment (optionally scoped to a single git branch).
 *
 * Safety properties:
 * - Only `target: ["preview"]` is ever sent. Production is never written.
 * - Secrets are read from a mode-600 JSON file and sent in the request body;
 *   they never appear in argv, shell history, or stdout.
 * - Values are validated against the same rules the server enforces
 *   (apps/web/src/server/config.ts) so a bad value fails here, not at runtime.
 * - Reporting is masked.
 *
 * Required environment:
 *   VERCEL_TOKEN   Vercel access token with project env permission
 *
 * Required input file (JSON), e.g. produced by generate-preview-secrets.mjs and
 * completed with the Railway values from provision-railway-preview.mjs:
 *   {
 *     "PUBLIC_BASE_URL": "https://<preview-origin>",
 *     "ALLOWED_ORIGINS": "https://<preview-origin>",
 *     "REDIS_URL": "rediss://...",
 *     "S3_ENDPOINT": "https://...",
 *     "S3_REGION": "...",
 *     "S3_BUCKET": "...",
 *     "S3_ACCESS_KEY_ID": "...",
 *     "S3_SECRET_ACCESS_KEY": "...",
 *     "KIOSK_REGISTRATION_SECRET": "...",
 *     "ADMIN_DIAGNOSTICS_SECRET": "...",
 *     "CLEANUP_WORKER_SECRET": "..."
 *   }
 */

const API = "https://api.vercel.com";

// Fixed, non-secret values that select the Railway stack and pin the session
// bounds. Kept here so the operator cannot forget one.
const FIXED = {
  PRINT_CESS_ADAPTER_MODE: "external",
  PRINT_CESS_SESSION_PROVIDER: "railway-redis",
  PRINT_CESS_BLOB_PROVIDER: "railway-s3",
  PRINT_CESS_CLEANUP_PROVIDER: "railway-worker",
  SESSION_TTL_SECONDS: "180",
  SIGNED_URL_TTL_SECONDS: "120",
  ENABLE_DEMO_ROUTES: "false",
  UPSTASH_DISABLE_TELEMETRY: "1",
};

const SECRET_KEYS = new Set([
  "REDIS_URL",
  "S3_ACCESS_KEY_ID",
  "S3_SECRET_ACCESS_KEY",
  "KIOSK_REGISTRATION_SECRET",
  "ADMIN_DIAGNOSTICS_SECRET",
  "CLEANUP_WORKER_SECRET",
]);

const REQUIRED_INPUT = [
  "PUBLIC_BASE_URL",
  "ALLOWED_ORIGINS",
  "REDIS_URL",
  "S3_ENDPOINT",
  "S3_REGION",
  "S3_BUCKET",
  "S3_ACCESS_KEY_ID",
  "S3_SECRET_ACCESS_KEY",
  "KIOSK_REGISTRATION_SECRET",
  "ADMIN_DIAGNOSTICS_SECRET",
  "CLEANUP_WORKER_SECRET",
];

function usage() {
  return [
    "Usage:",
    "  VERCEL_TOKEN=... node scripts/provisioning/set-vercel-preview-env.mjs \\",
    "    --project <projectId> --team <teamId> --input <values.json> [--branch <git-branch>] [--dry-run]",
  ].join("\n");
}

function parseArguments(argv) {
  const options = { dryRun: false };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === "--dry-run") {
      options.dryRun = true;
      continue;
    }
    const value = argv[index + 1];
    if (!value) throw new Error(usage());
    if (flag === "--project") options.project = value;
    else if (flag === "--team") options.team = value;
    else if (flag === "--input") options.input = resolve(value);
    else if (flag === "--branch") options.branch = value;
    else throw new Error(usage());
    index += 1;
  }
  if (!options.project || !options.team || !options.input) throw new Error(usage());
  return options;
}

/** Mirror of the server-side config gate so bad values fail before deployment. */
function validate(values) {
  const problems = [];

  for (const name of REQUIRED_INPUT) {
    if (!values[name]) problems.push(`${name} is missing`);
  }
  if (problems.length > 0) return problems;

  const assertExactHttpsOrigin = (name) => {
    let url;
    try {
      url = new URL(values[name]);
    } catch {
      problems.push(`${name} is not a valid URL`);
      return;
    }
    if (url.protocol !== "https:" || values[name] !== url.origin) {
      problems.push(`${name} must be an exact HTTPS origin with no path, query, or fragment`);
    }
  };
  assertExactHttpsOrigin("PUBLIC_BASE_URL");
  for (const origin of values.ALLOWED_ORIGINS.split(",").map((entry) => entry.trim())) {
    if (origin === "*") problems.push("ALLOWED_ORIGINS must never contain a wildcard");
    else {
      try {
        const url = new URL(origin);
        if (url.protocol !== "https:" || origin !== url.origin) {
          problems.push(`ALLOWED_ORIGINS entry must be an exact HTTPS origin: ${origin}`);
        }
      } catch {
        problems.push("ALLOWED_ORIGINS contains an invalid origin");
      }
    }
  }

  try {
    if (new URL(values.REDIS_URL).protocol !== "rediss:") {
      problems.push("REDIS_URL must use TLS (rediss://)");
    }
  } catch {
    problems.push("REDIS_URL is not a valid URL");
  }

  try {
    if (new URL(values.S3_ENDPOINT).protocol !== "https:") {
      problems.push("S3_ENDPOINT must use HTTPS");
    }
  } catch {
    problems.push("S3_ENDPOINT is not a valid URL");
  }

  for (const name of [
    "KIOSK_REGISTRATION_SECRET",
    "ADMIN_DIAGNOSTICS_SECRET",
    "CLEANUP_WORKER_SECRET",
  ]) {
    if (values[name].length < 32) problems.push(`${name} must contain at least 32 characters`);
  }
  const distinct = new Set([
    values.KIOSK_REGISTRATION_SECRET,
    values.ADMIN_DIAGNOSTICS_SECRET,
    values.CLEANUP_WORKER_SECRET,
  ]);
  if (distinct.size !== 3) problems.push("The three application secrets must be distinct");

  return problems;
}

async function upsert(name, value, options, token) {
  const body = {
    key: name,
    value,
    type: SECRET_KEYS.has(name) ? "sensitive" : "encrypted",
    // Production is deliberately never a target here.
    target: ["preview"],
    ...(options.branch ? { gitBranch: options.branch } : {}),
  };
  const url = `${API}/v10/projects/${encodeURIComponent(options.project)}/env?teamId=${encodeURIComponent(options.team)}&upsert=true`;
  const response = await fetch(url, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    const detail = await response.text();
    let code = "";
    try {
      code = JSON.parse(detail)?.error?.code ?? "";
    } catch {
      // Status alone is enough; the raw body may echo the value.
    }
    throw new Error(`${name}: HTTP ${response.status}${code ? ` (${code})` : ""}`);
  }
}

try {
  const options = parseArguments(process.argv.slice(2));
  const token = requireEnvironment("VERCEL_TOKEN", { minimumLength: 20 });
  const values = JSON.parse(await readFile(options.input, "utf8"));

  const problems = validate(values);
  if (problems.length > 0) {
    process.stderr.write("Refusing to write invalid Preview configuration:\n");
    for (const problem of problems) process.stderr.write(`- ${problem}\n`);
    process.exitCode = 1;
  } else {
    const payload = { ...FIXED, ...Object.fromEntries(REQUIRED_INPUT.map((k) => [k, values[k]])) };
    if (values.S3_FORCE_PATH_STYLE) payload.S3_FORCE_PATH_STYLE = values.S3_FORCE_PATH_STYLE;

    report("Target project", options.project);
    report("Target team", options.team);
    report("Environment", `preview${options.branch ? ` (branch ${options.branch})` : ""}`);
    report("Production", "NOT written");
    process.stdout.write("\n");

    for (const [name, value] of Object.entries(payload)) {
      const shown = SECRET_KEYS.has(name)
        ? describeSecret(value)
        : name.endsWith("_URL") || name === "PUBLIC_BASE_URL"
          ? describeUrl(value)
          : value;
      if (options.dryRun) {
        report(`[dry-run] ${name}`, shown);
      } else {
        await upsert(name, value, options, token);
        report(name, `set — ${shown}`);
      }
    }
    process.stdout.write(
      options.dryRun
        ? "\nDry run complete. Re-run without --dry-run to apply.\n"
        : "\nPreview environment updated. Redeploy the Preview branch, then delete the input file.\n",
    );
  }
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
