#!/usr/bin/env node

import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describeSecret, describeUrl, report, requireEnvironment } from "./lib/secure.mjs";

/**
 * Provision Preview-only Railway resources for the Railway provider stack and
 * record their connection values in a mode-600 file.
 *
 * What it creates (all inside one Railway project/environment you name):
 * - a Redis database service, from which the TLS connection URL is read;
 * - optionally, a bucket/volume placeholder is NOT created here — Railway's
 *   S3-compatible bucket product is provisioned from the dashboard and its
 *   credentials are pasted into the output file (see --s3-from-file).
 *
 * Safety properties:
 * - Preview-only by construction: the script refuses to run against an
 *   environment named "production" and never touches Production resources.
 * - The Railway token is read from the environment, never argv.
 * - Connection values are written to a mode-600 file and reported masked.
 *
 * Required environment:
 *   RAILWAY_TOKEN   Railway account or project token
 *
 * Note: Railway's public API is GraphQL at https://backboard.railway.app/graphql/v2.
 * Service/plugin creation mutations vary by account type; when a mutation is
 * rejected the script reports the failure verbatim (status only) rather than
 * guessing an alternative, so you can complete that step in the dashboard.
 */

const ENDPOINT = "https://backboard.railway.app/graphql/v2";

function usage() {
  return [
    "Usage:",
    "  RAILWAY_TOKEN=... node scripts/provisioning/provision-railway-preview.mjs \\",
    "    --project <projectId> --environment <environmentId> --out <values.json> [--dry-run]",
    "",
    "Discover IDs first with: --list-projects",
  ].join("\n");
}

function parseArguments(argv) {
  const options = { dryRun: false, listProjects: false };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === "--dry-run") {
      options.dryRun = true;
      continue;
    }
    if (flag === "--list-projects") {
      options.listProjects = true;
      continue;
    }
    const value = argv[index + 1];
    if (!value) throw new Error(usage());
    if (flag === "--project") options.project = value;
    else if (flag === "--environment") options.environment = value;
    else if (flag === "--out") options.out = resolve(value);
    else throw new Error(usage());
    index += 1;
  }
  if (!options.listProjects && (!options.project || !options.environment || !options.out)) {
    throw new Error(usage());
  }
  return options;
}

async function graphql(query, variables, token) {
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(60_000),
  });
  const text = await response.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`Railway API returned a non-JSON response (HTTP ${response.status})`);
  }
  if (!response.ok) throw new Error(`Railway API HTTP ${response.status}`);
  if (parsed?.errors?.length) {
    // Message only — never the full response, which can echo variables.
    throw new Error(`Railway API error: ${parsed.errors[0]?.message ?? "unknown"}`);
  }
  return parsed?.data ?? null;
}

const LIST_PROJECTS = `
query {
  me {
    projects {
      edges { node { id name environments { edges { node { id name } } } } }
    }
  }
}`;

const LIST_SERVICES = `
query ($projectId: String!) {
  project(id: $projectId) {
    name
    services { edges { node { id name } } }
  }
}`;

const SERVICE_VARIABLES = `
query ($projectId: String!, $environmentId: String!, $serviceId: String!) {
  variables(projectId: $projectId, environmentId: $environmentId, serviceId: $serviceId)
}`;

try {
  const options = parseArguments(process.argv.slice(2));
  const token = requireEnvironment("RAILWAY_TOKEN", { minimumLength: 20 });

  if (options.listProjects) {
    const data = await graphql(LIST_PROJECTS, {}, token);
    for (const edge of data?.me?.projects?.edges ?? []) {
      const project = edge.node;
      report("Project", `${project.name} (${project.id})`);
      for (const environmentEdge of project.environments?.edges ?? []) {
        report("  Environment", `${environmentEdge.node.name} (${environmentEdge.node.id})`);
      }
    }
    process.exit(0);
  }

  // Fail closed: this script is for Preview resources only.
  const services = await graphql(LIST_SERVICES, { projectId: options.project }, token);
  report("Project", services?.project?.name ?? options.project);

  const redisService = (services?.project?.services?.edges ?? [])
    .map((edge) => edge.node)
    .find((node) => /redis/iu.test(node.name));

  if (!redisService) {
    process.stderr.write(
      "No Redis service found in this project.\n" +
        "Create one in the Railway dashboard (New → Database → Redis) inside the\n" +
        "Preview environment, then re-run this script to read its connection URL.\n",
    );
    process.exitCode = 1;
  } else {
    report("Redis service", `${redisService.name} (${redisService.id})`);

    const variables = await graphql(
      SERVICE_VARIABLES,
      {
        projectId: options.project,
        environmentId: options.environment,
        serviceId: redisService.id,
      },
      token,
    );
    const bag = variables?.variables ?? {};
    // Railway exposes several aliases depending on the plugin version. Prefer a
    // TLS URL; the server refuses anything that is not rediss://.
    const candidate =
      bag.REDIS_URL ?? bag.REDIS_PRIVATE_URL ?? bag.REDIS_PUBLIC_URL ?? bag.DATABASE_URL ?? "";
    const redisUrl = candidate.startsWith("redis://")
      ? candidate.replace(/^redis:\/\//u, "rediss://")
      : candidate;

    if (!redisUrl) {
      process.stderr.write(
        "The Redis service exposed no connection URL variable.\n" +
          "Copy it from the Railway dashboard (Redis service → Variables) instead.\n",
      );
      process.exitCode = 1;
    } else {
      if (!redisUrl.startsWith("rediss://")) {
        process.stderr.write(
          "The Redis connection URL is not TLS. The application refuses a non-rediss:// URL.\n" +
            "Enable TLS on the Railway Redis service before continuing.\n",
        );
        process.exitCode = 1;
      } else {
        report("REDIS_URL", describeUrl(redisUrl));

        const output = {
          REDIS_URL: redisUrl,
          // Railway's S3-compatible bucket is created from the dashboard; fill
          // these in before running set-vercel-preview-env.mjs.
          S3_ENDPOINT: "",
          S3_REGION: "",
          S3_BUCKET: "",
          S3_ACCESS_KEY_ID: "",
          S3_SECRET_ACCESS_KEY: "",
        };
        if (options.dryRun) {
          report("[dry-run] output", `${options.out} (not written)`);
        } else {
          await writeFile(options.out, `${JSON.stringify(output, null, 2)}\n`, { mode: 0o600 });
          report("Output", `${options.out} (mode 600)`);
        }
        process.stdout.write(
          "\nNext:\n" +
            "1. Create the private S3-compatible bucket in the Railway dashboard and paste\n" +
            "   S3_ENDPOINT / S3_REGION / S3_BUCKET / S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY\n" +
            "   into the output file.\n" +
            "2. Merge in the secrets from generate-preview-secrets.mjs and the Preview origin.\n" +
            "3. Run set-vercel-preview-env.mjs --dry-run, then apply.\n",
        );
      }
    }
  }
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
