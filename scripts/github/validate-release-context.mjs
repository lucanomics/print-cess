import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const stableTagPattern = /^v\d+\.\d+\.\d+$/;
const prereleaseTagPattern = /^v\d+\.\d+\.\d+-[0-9A-Za-z][0-9A-Za-z.-]*$/;
const commitPattern = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i;

export function validateReleaseContext(input) {
  const context = {
    workflowRefType: required(input.workflowRefType, "WORKFLOW_REF_TYPE"),
    workflowRefName: required(input.workflowRefName, "WORKFLOW_REF_NAME"),
    workflowSha: required(input.workflowSha, "WORKFLOW_SHA"),
    releaseTag: required(input.releaseTag, "RELEASE_TAG"),
    releaseChannel: required(input.releaseChannel, "RELEASE_CHANNEL"),
  };

  if (context.workflowRefType !== "tag") {
    throw new Error("Release signing must be dispatched from a tag ref.");
  }
  if (context.workflowRefName !== context.releaseTag) {
    throw new Error("The workflow ref must exactly match the requested release tag.");
  }
  if (!commitPattern.test(context.workflowSha)) {
    throw new Error("The workflow commit must be a full Git object ID.");
  }

  if (context.releaseChannel === "stable") {
    if (!stableTagPattern.test(context.releaseTag)) {
      throw new Error("Stable tags must match vX.Y.Z.");
    }
  } else if (context.releaseChannel === "prerelease") {
    if (!prereleaseTagPattern.test(context.releaseTag)) {
      throw new Error("Prerelease tags must match vX.Y.Z-<label>.");
    }
  } else {
    throw new Error("The release channel must be stable or prerelease.");
  }

  return context;
}

export function verifyReleaseRepository(context, runGit = defaultRunGit) {
  const tagCommit = runGit([
    "rev-parse",
    "--verify",
    `refs/tags/${context.releaseTag}^{commit}`,
  ]).trim();

  if (!commitPattern.test(tagCommit)) {
    throw new Error("The requested tag did not resolve to a full Git object ID.");
  }
  if (tagCommit.toLowerCase() !== context.workflowSha.toLowerCase()) {
    throw new Error("The requested tag commit does not match the workflow ref commit.");
  }

  runGit(["merge-base", "--is-ancestor", tagCommit, "refs/remotes/origin/main"]);
  return tagCommit;
}

function defaultRunGit(args) {
  try {
    return execFileSync("git", args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch {
    throw new Error("The release tag must exist and be reachable from protected main.");
  }
}

function required(value, name) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${name} is required.`);
  }
  return value;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const context = validateReleaseContext({
    workflowRefType: process.env.WORKFLOW_REF_TYPE,
    workflowRefName: process.env.WORKFLOW_REF_NAME,
    workflowSha: process.env.WORKFLOW_SHA,
    releaseTag: process.env.RELEASE_TAG,
    releaseChannel: process.env.RELEASE_CHANNEL,
  });
  const tagCommit = verifyReleaseRepository(context);
  console.log(`Validated release provenance for ${context.releaseTag} at ${tagCommit}.`);
}
