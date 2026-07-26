#!/usr/bin/env node

import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describeSecret, generateSecret, report } from "./lib/secure.mjs";

/**
 * Generate the Preview-only application secrets required by the config gate:
 *
 *   KIOSK_REGISTRATION_SECRET   >= 32 characters
 *   ADMIN_DIAGNOSTICS_SECRET    >= 32 characters (distinct)
 *   CLEANUP_WORKER_SECRET       >= 32 characters (distinct)
 *
 * Values are written to a mode-600 file, never to stdout, so they can be fed to
 * `set-vercel-preview-env.mjs` without passing through the terminal or shell
 * history. Delete the file once the variables are set.
 */

function usage() {
  return "Usage: node scripts/provisioning/generate-preview-secrets.mjs --out <path.json>";
}

function parseOutputPath(argv) {
  if (argv.length !== 2 || argv[0] !== "--out" || !argv[1]) throw new Error(usage());
  return resolve(argv[1]);
}

// 32 random bytes -> 43 base64url characters, comfortably above the 32-character
// floor enforced by apps/web/src/server/config.ts.
function distinctSecrets() {
  const secrets = {
    KIOSK_REGISTRATION_SECRET: generateSecret(32),
    ADMIN_DIAGNOSTICS_SECRET: generateSecret(32),
    CLEANUP_WORKER_SECRET: generateSecret(32),
  };
  const unique = new Set(Object.values(secrets));
  if (unique.size !== Object.keys(secrets).length) {
    throw new Error("Generated secrets collided; re-run to obtain distinct values.");
  }
  return secrets;
}

try {
  const outputPath = parseOutputPath(process.argv.slice(2));
  const secrets = distinctSecrets();
  await writeFile(outputPath, `${JSON.stringify(secrets, null, 2)}\n`, { mode: 0o600 });
  report("Secrets file", `${outputPath} (mode 600)`);
  for (const [name, value] of Object.entries(secrets)) report(name, describeSecret(value));
  process.stdout.write(
    "\nNext: pass this file to set-vercel-preview-env.mjs, then delete it.\n" +
      "Never commit it and never print its contents.\n",
  );
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
