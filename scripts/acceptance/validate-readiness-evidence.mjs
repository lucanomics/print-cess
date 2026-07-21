#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  ReadinessEvidencePolicyError,
  validateReadinessDossier,
} from "./readiness-evidence-policy.mjs";

function usage() {
  return "Usage: node scripts/acceptance/validate-readiness-evidence.mjs --input <private-dossier.json>";
}

function parseInputPath(arguments_) {
  if (arguments_.length !== 2 || arguments_[0] !== "--input" || !arguments_[1]) {
    throw new Error(usage());
  }
  return resolve(arguments_[1]);
}

try {
  const inputPath = parseInputPath(process.argv.slice(2));
  const dossier = JSON.parse(await readFile(inputPath, "utf8"));
  const summary = validateReadinessDossier(dossier);
  process.stdout.write(
    `Readiness evidence complete for ${summary.releaseTag} (${summary.releaseCommit}).\n`,
  );
} catch (error) {
  if (error instanceof ReadinessEvidencePolicyError) {
    process.stderr.write(`${error.message}\n`);
    for (const violation of error.violations) process.stderr.write(`- ${violation}\n`);
  } else {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  }
  process.exitCode = 1;
}
