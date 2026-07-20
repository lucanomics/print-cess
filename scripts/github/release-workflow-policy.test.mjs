import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const releaseWorkflow = await readFile(
  new URL("../../.github/workflows/release-kiosk.yml", import.meta.url),
  "utf8",
);
const ciWorkflow = await readFile(
  new URL("../../.github/workflows/ci.yml", import.meta.url),
  "utf8",
);
const kioskProject = await readFile(
  new URL(
    "../../apps/kiosk/Paradiso.PrintCess.Kiosk/Paradiso.PrintCess.Kiosk.csproj",
    import.meta.url,
  ),
  "utf8",
);
const collector = await readFile(
  new URL("../windows/Invoke-PrintCessAcceptance.ps1", import.meta.url),
  "utf8",
);

test("release artifacts bind executable version to the tag and commit", () => {
  assert.match(releaseWorkflow, /RELEASE_VERSION=\$releaseVersion/);
  assert.match(
    releaseWorkflow,
    /RELEASE_INFORMATIONAL_VERSION=\$releaseVersion\+\$env:WORKFLOW_SHA/,
  );
  assert.match(releaseWorkflow, /--no-restore/);
  assert.match(releaseWorkflow, /-p:PrintCessReleaseVersion=\$env:RELEASE_VERSION/);
  assert.match(
    releaseWorkflow,
    /-p:PrintCessReleaseInformationalVersion=\$env:RELEASE_INFORMATIONAL_VERSION/,
  );
  assert.match(kioskProject, /<Version Condition="'\$\(PrintCessReleaseVersion\)' != ''">/);
  assert.match(kioskProject, /<InformationalVersion Condition=/);
  assert.match(kioskProject, /<IncludeSourceRevisionInInformationalVersion Condition=/);
});

test("signing requires the exact approved certificate and a timestamp", () => {
  assert.match(releaseWorkflow, /AUTHENTICODE_EXPECTED_THUMBPRINT/);
  assert.match(releaseWorkflow, /approved 40-hex certificate thumbprint/);
  assert.match(releaseWorkflow, /verify \/pa \/all \/tw \/v/);
  assert.match(releaseWorkflow, /sign \/fd SHA256 \/tr \$env:TIMESTAMP_URL \/td SHA256/);
  assert.match(releaseWorkflow, /TimeStamperCertificate/);
  assert.match(releaseWorkflow, /thumbprint does not match the approved certificate/);
  assert.doesNotMatch(releaseWorkflow, /SignerCertificate\.Subject\.Contains/);
});

test("signing emits a hashed structured manifest as release evidence", () => {
  for (const field of [
    "releaseTag",
    "workflowSha",
    "protocolVersion",
    "signerThumbprint",
    "timestampThumbprint",
    "verificationFlags",
  ]) {
    assert.match(releaseWorkflow, new RegExp(`\\b${field}\\b`));
  }
  assert.match(releaseWorkflow, /authenticode-manifest\.json\.sha256/);
  assert.match(releaseWorkflow, /artifacts\/signing-evidence\/authenticode-manifest\.json/);
});

test("target acceptance and required Windows CI enforce the evidence contract", () => {
  for (const parameter of [
    "SigningManifestPath",
    "ExpectedSigningManifestSha256",
    "ExpectedReleaseTag",
    "ExpectedCommitSha",
    "ExpectedSignerThumbprint",
  ]) {
    assert.match(collector, new RegExp(`\\$${parameter}\\b`));
  }
  assert.match(collector, /Assert-SigningManifestContract/);
  assert.match(collector, /Assert-ApplicationMatchesSigningManifest/);
  assert.match(ciWorkflow, /\.\/scripts\/windows\/Test-AcceptancePolicy\.ps1/);
});
