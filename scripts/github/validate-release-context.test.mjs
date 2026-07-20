import assert from "node:assert/strict";
import test from "node:test";

import { validateReleaseContext, verifyReleaseRepository } from "./validate-release-context.mjs";

const sha = "a".repeat(40);

test("accepts stable and prerelease tag contexts", () => {
  assert.equal(
    validContext({ releaseTag: "v1.2.3", releaseChannel: "stable" }).releaseTag,
    "v1.2.3",
  );
  assert.equal(
    validContext({ releaseTag: "v1.2.3-rc.4", releaseChannel: "prerelease" }).releaseTag,
    "v1.2.3-rc.4",
  );
});

for (const [name, override] of [
  ["branch workflow ref", { workflowRefType: "branch" }],
  ["mismatched workflow ref", { workflowRefName: "v1.2.4" }],
  ["abbreviated workflow commit", { workflowSha: "abc1234" }],
  ["stable prerelease tag", { releaseTag: "v1.2.3-rc.1", releaseChannel: "stable" }],
  ["prerelease stable tag", { releaseTag: "v1.2.3", releaseChannel: "prerelease" }],
  ["unknown channel", { releaseChannel: "nightly" }],
]) {
  test(`rejects ${name}`, () => {
    assert.throws(() => validContext(override));
  });
}

test("verifies the tag commit and protected-main ancestry", () => {
  const calls = [];
  const context = validContext();
  const result = verifyReleaseRepository(context, (args) => {
    calls.push(args);
    return args[0] === "rev-parse" ? `${sha}\n` : "";
  });

  assert.equal(result, sha);
  assert.deepEqual(calls, [
    ["rev-parse", "--verify", "refs/tags/v1.2.3^{commit}"],
    ["merge-base", "--is-ancestor", sha, "refs/remotes/origin/main"],
  ]);
});

test("rejects a tag commit that differs from the workflow commit", () => {
  const context = validContext();
  assert.throws(() => verifyReleaseRepository(context, () => "b".repeat(40)), /does not match/);
});

test("rejects a tag that is not reachable from protected main", () => {
  const context = validContext();
  assert.throws(
    () =>
      verifyReleaseRepository(context, (args) => {
        if (args[0] === "rev-parse") return sha;
        throw new Error("not an ancestor");
      }),
    /not an ancestor/,
  );
});

function validContext(override = {}) {
  const releaseTag = override.releaseTag ?? "v1.2.3";
  return validateReleaseContext({
    workflowRefType: "tag",
    workflowRefName: releaseTag,
    workflowSha: sha,
    releaseTag,
    releaseChannel: "stable",
    ...override,
  });
}
