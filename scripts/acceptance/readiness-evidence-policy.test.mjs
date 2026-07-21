import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  REQUIRED_ACCESSIBILITY_CHECKS,
  REQUIRED_ACCESSIBILITY_DEVICES,
  REQUIRED_APPROVAL_GATES,
  REQUIRED_CODEQL_LANGUAGES,
  REQUIRED_DRILL_ROLES,
  REQUIRED_DRILL_STEPS,
  REQUIRED_LOCALES,
  REQUIRED_PROVIDER_CHECKS,
  REQUIRED_PROVIDER_RESOURCES,
  REQUIRED_REPOSITORY_CHECKS,
  REQUIRED_WINDOWS_TESTS,
  REQUIRED_WINDOWS_WITNESS_ROLES,
  ReadinessEvidencePolicyError,
  validateReadinessDossier,
} from "./readiness-evidence-policy.mjs";

const COMMIT = "a".repeat(40);
const SIGNER = "b".repeat(40);
const MANIFEST_SHA = "c".repeat(64);
const EXECUTABLE_SHA = "d".repeat(64);

function sha(character = "e") {
  return character.repeat(64);
}

function recordId(prefix, value) {
  return `${prefix}-${value.replace(/[^A-Za-z0-9]/g, "-").toUpperCase()}`;
}

function evidenceRef(value) {
  return {
    recordId: recordId("EVIDENCE", value),
    sha256: sha("e"),
    sanitized: true,
  };
}

function passedChecks(ids) {
  return ids.map((id) => ({ id, passed: true }));
}

function completeDossier() {
  const providerAt = "2026-01-01T01:00:00Z";
  const repositoryAt = "2026-01-01T02:00:00Z";
  const authenticodeAt = "2026-01-01T03:00:00Z";
  const windowsAt = "2026-01-01T04:00:00Z";
  const accessibilityAt = "2026-01-01T05:00:00Z";
  const incidentAt = "2026-01-01T06:00:00Z";
  const finalAt = "2026-01-01T07:00:00Z";

  const decisionTime = {
    "accessibility-content": "2026-01-01T05:30:00Z",
    "brand-service-ownership": "2026-01-01T06:30:00Z",
    "final-go-no-go": finalAt,
    "incident-readiness": "2026-01-01T06:30:00Z",
    "information-security": "2026-01-01T03:30:00Z",
    "printer-site-operations": "2026-01-01T04:30:00Z",
    "privacy-legal": "2026-01-01T06:30:00Z",
    "procurement-provider": "2026-01-01T01:30:00Z",
    "windows-endpoint": "2026-01-01T04:30:00Z",
  };

  return {
    schemaVersion: 1,
    templateOnly: false,
    product: "Print-cess by Paradiso",
    generatedAtUtc: "2026-01-01T08:00:00Z",
    syntheticDocumentsOnly: true,
    productionTouched: false,
    sanitization: {
      containsPersonalData: false,
      containsCredentials: false,
      containsLiveQrOrSignedUrl: false,
      containsDocumentContent: false,
    },
    release: {
      tag: "v1.2.3-rc.1",
      commit: COMMIT,
      protocolVersion: 1,
      signingManifestSha256: MANIFEST_SHA,
      executableSha256: EXECUTABLE_SHA,
      signerThumbprint: SIGNER,
      preview: {
        environment: "Preview",
        deploymentId: "DPL-PREVIEW-123",
        commit: COMMIT,
        production: false,
      },
    },
    stages: {
      providerPreview: {
        status: "passed",
        completedAtUtc: providerAt,
        releaseCommit: COMMIT,
        previewDeploymentId: "DPL-PREVIEW-123",
        syntheticOnly: true,
        isolatedFromProduction: true,
        credentialsScopedToPreview: true,
        resources: REQUIRED_PROVIDER_RESOURCES.map((kind) => ({
          kind,
          resourceRef: recordId("RESOURCE", kind),
          approvalRecordId: recordId("APPROVAL", kind),
          configurationSha256: sha("1"),
          productionResource: false,
        })),
        checks: passedChecks(REQUIRED_PROVIDER_CHECKS),
        evidenceRefs: [evidenceRef("provider")],
      },
      windowsPrinter: {
        status: "passed",
        completedAtUtc: windowsAt,
        releaseCommit: COMMIT,
        releaseTag: "v1.2.3-rc.1",
        signingManifestSha256: MANIFEST_SHA,
        executableSha256: EXECUTABLE_SHA,
        signerThumbprint: SIGNER,
        collectorEvidenceSha256: sha("2"),
        deviceConfigurationSha256: sha("3"),
        printerConfigurationSha256: sha("4"),
        spoolRetentionDecisionId: "DECISION-SPOOL-RETENTION",
        syntheticOnly: true,
        physicalOutputDestroyed: true,
        noAutomaticUncertainRetry: true,
        tests: passedChecks(REQUIRED_WINDOWS_TESTS),
        witnesses: REQUIRED_WINDOWS_WITNESS_ROLES.map((role) => ({
          role,
          witnessRef: recordId("WITNESS", role),
          attestationRecordId: recordId("ATTESTATION", role),
          attestationSha256: sha("5"),
        })),
        evidenceRefs: [evidenceRef("windows-printer")],
      },
      repositorySecurity: {
        status: "passed",
        completedAtUtc: repositoryAt,
        releaseCommit: COMMIT,
        branchProtectionEvidenceSha256: sha("6"),
        releaseTagRulesetEvidenceSha256: sha("7"),
        independentReviewerRef: "REVIEWER-INDEPENDENT",
        repositoryAdministratorRef: "ADMINISTRATOR-REPOSITORY",
        requiredChecks: REQUIRED_REPOSITORY_CHECKS.map((name) => ({
          name,
          required: true,
          passed: true,
        })),
        codeql: {
          enabled: true,
          configuration: "default",
          languages: [...REQUIRED_CODEQL_LANGUAGES],
        },
        secretScanning: {
          enabled: true,
          pushProtectionEnabled: true,
          helperScanPassed: true,
        },
        evidenceRefs: [evidenceRef("repository-security")],
      },
      authenticode: {
        status: "passed",
        completedAtUtc: authenticodeAt,
        releaseCommit: COMMIT,
        releaseTag: "v1.2.3-rc.1",
        signingManifestSha256: MANIFEST_SHA,
        executableSha256: EXECUTABLE_SHA,
        signerThumbprint: SIGNER,
        signatureValid: true,
        timestampPresent: true,
        timestampDigest: "sha256",
        certificateCurrentlyValid: true,
        malwareScanPassed: true,
        targetDeviceReverified: true,
        certificateCustodyDecisionId: "DECISION-CERTIFICATE-CUSTODY",
        signingEvidenceSha256: sha("8"),
        targetVerificationEvidenceSha256: sha("9"),
        evidenceRefs: [evidenceRef("authenticode")],
      },
      accessibilityLanguage: {
        status: "passed",
        completedAtUtc: accessibilityAt,
        releaseCommit: COMMIT,
        previewDeploymentId: "DPL-PREVIEW-123",
        syntheticOnly: true,
        productAccessibilityOwnerRef: "OWNER-ACCESSIBILITY",
        ownerAttestationRecordId: "ATTESTATION-ACCESSIBILITY-OWNER",
        ownerAttestationSha256: sha("a"),
        devices: REQUIRED_ACCESSIBILITY_DEVICES.map((id) => ({
          id,
          configurationSha256: sha("b"),
          passed: true,
        })),
        mobileCarrierRefs: ["CARRIER-APPROVED-ONE", "CARRIER-APPROVED-TWO"],
        checks: passedChecks(REQUIRED_ACCESSIBILITY_CHECKS),
        locales: REQUIRED_LOCALES.map((locale, index) => ({
          locale,
          reviewerRef: `REVIEWER-NATIVE-${String(index + 1).padStart(2, "0")}`,
          qualifiedNativeReviewer: true,
          visibleTextReviewedInContext: true,
          speechReviewedInContext: true,
          passed: true,
          attestationRecordId: `ATTESTATION-LOCALE-${String(index + 1).padStart(2, "0")}`,
          attestationSha256: sha("c"),
        })),
        evidenceRefs: [evidenceRef("accessibility-language")],
      },
      incidentRollback: {
        status: "passed",
        completedAtUtc: incidentAt,
        releaseCommit: COMMIT,
        previewDeploymentId: "DPL-PREVIEW-123",
        authorizedDrillWindow: true,
        previewOnly: true,
        productionTouched: false,
        realPersonalDataUsed: false,
        realCredentialRevoked: false,
        oldSyntheticCredentialRejected: true,
        activeSessionsZeroBeforeRollback: true,
        orphanCleanupBoundedAndIdempotent: true,
        knownGoodSignedArtifactVerified: true,
        noUncertainJobReprinted: true,
        allGapsHaveOwnerAndDueDate: true,
        drillAuthorizationRecordId: "AUTHORIZATION-DRILL-WINDOW",
        roles: REQUIRED_DRILL_ROLES.map((role) => ({
          role,
          ownerRef: recordId("ROLEOWNER", role),
        })),
        steps: passedChecks(REQUIRED_DRILL_STEPS),
        recoveryObjectives: {
          rtoTargetMinutes: 60,
          rtoActualMinutes: 45,
          rpoTargetMinutes: 3,
          rpoActualMinutes: 0,
        },
        evidenceRefs: [evidenceRef("incident-rollback")],
      },
      institutionalApproval: {
        status: "approved",
        completedAtUtc: finalAt,
        releaseCommit: COMMIT,
        previewDeploymentId: "DPL-PREVIEW-123",
        allConditionsAccepted: true,
        launchWindowApproved: true,
        rollbackAuthorityNamed: true,
        decisions: REQUIRED_APPROVAL_GATES.map((gate) => ({
          gate,
          decision: "approved",
          decidedAtUtc: decisionTime[gate],
          reviewByUtc: "2027-01-01T00:00:00Z",
          approverRef: recordId("APPROVER", gate),
          decisionRecordId: recordId("DECISION", gate),
          attestationSha256: sha("d"),
          scopeCommit: COMMIT,
          conditionsAccepted: true,
        })),
        evidenceRefs: [evidenceRef("institutional-approval")],
      },
    },
  };
}

function violationsFor(dossier) {
  try {
    validateReadinessDossier(dossier);
    return [];
  } catch (error) {
    assert.ok(error instanceof ReadinessEvidencePolicyError);
    return error.violations;
  }
}

test("accepts a complete release-bound external readiness dossier", () => {
  const summary = validateReadinessDossier(completeDossier());
  assert.deepEqual(summary, {
    schemaVersion: 1,
    product: "Print-cess by Paradiso",
    releaseTag: "v1.2.3-rc.1",
    releaseCommit: COMMIT,
    previewDeploymentId: "DPL-PREVIEW-123",
    completedAtUtc: "2026-01-01T07:00:00Z",
  });
});

test("CLI validates a private dossier path without echoing dossier content", () => {
  const directory = mkdtempSync(join(tmpdir(), "print-cess-readiness-"));
  const inputPath = join(directory, "dossier.json");
  try {
    writeFileSync(inputPath, JSON.stringify(completeDossier()), { mode: 0o600 });
    const result = spawnSync(
      process.execPath,
      ["scripts/acceptance/validate-readiness-evidence.mjs", "--input", inputPath],
      { cwd: process.cwd(), encoding: "utf8" },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.match(
      result.stdout,
      /^Readiness evidence complete for v1\.2\.3-rc\.1 \([a-f0-9]{40}\)\./,
    );
    assert.equal(result.stderr, "");
    assert.doesNotMatch(result.stdout, /DPL-PREVIEW-123/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("template CLI creates a private, overwrite-safe, deliberately incomplete dossier", () => {
  const directory = mkdtempSync(join(tmpdir(), "print-cess-readiness-template-"));
  const outputPath = join(directory, "dossier.json");
  try {
    const arguments_ = [
      "scripts/acceptance/create-readiness-evidence-template.mjs",
      "--output",
      outputPath,
    ];
    const first = spawnSync(process.execPath, arguments_, {
      cwd: process.cwd(),
      encoding: "utf8",
    });
    assert.equal(first.status, 0, first.stderr);
    assert.equal(statSync(outputPath).mode & 0o777, 0o600);
    const template = JSON.parse(readFileSync(outputPath, "utf8"));
    assert.equal(template.templateOnly, true);
    assert.equal(template.stages.providerPreview.status, "not-run");
    assert.ok(
      violationsFor(template).includes("$.templateOnly must equal false."),
      "template must never validate as final evidence",
    );

    const second = spawnSync(process.execPath, arguments_, {
      cwd: process.cwd(),
      encoding: "utf8",
    });
    assert.equal(second.status, 1);
    assert.match(second.stderr, /EEXIST|file already exists/i);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("rejects helper-only security evidence when native CodeQL or push protection is disabled", () => {
  const dossier = completeDossier();
  dossier.stages.repositorySecurity.codeql.enabled = false;
  dossier.stages.repositorySecurity.secretScanning.pushProtectionEnabled = false;
  const violations = violationsFor(dossier);
  assert.ok(violations.includes("$.stages.repositorySecurity.codeql.enabled must equal true."));
  assert.ok(
    violations.includes(
      "$.stages.repositorySecurity.secretScanning.pushProtectionEnabled must equal true.",
    ),
  );
});

test("accepts native CodeQL advanced configuration", () => {
  const dossier = completeDossier();
  dossier.stages.repositorySecurity.codeql.configuration = "advanced";
  assert.equal(validateReadinessDossier(dossier).releaseCommit, COMMIT);
});

test("accepts additional passing checks, scanned languages, and supported devices", () => {
  const dossier = completeDossier();
  dossier.stages.providerPreview.checks.push({ id: "provider-quota-alert", passed: true });
  dossier.stages.windowsPrinter.tests.push({ id: "vendor-firmware-retention", passed: true });
  dossier.stages.repositorySecurity.requiredChecks.push({
    name: "License policy",
    required: true,
    passed: true,
  });
  dossier.stages.repositorySecurity.codeql.languages.push("actions");
  dossier.stages.accessibilityLanguage.devices.push({
    id: "android-chrome-tablet",
    configurationSha256: sha("f"),
    passed: true,
  });
  dossier.stages.accessibilityLanguage.checks.push({
    id: "switch-control",
    passed: true,
  });
  assert.equal(validateReadinessDossier(dossier).releaseTag, "v1.2.3-rc.1");
});

test("rejects release and Preview identities that drift between evidence stages", () => {
  const dossier = completeDossier();
  dossier.release.preview.commit = "f".repeat(40);
  dossier.stages.windowsPrinter.releaseCommit = "f".repeat(40);
  dossier.stages.accessibilityLanguage.previewDeploymentId = "DPL-OTHER";
  const violations = violationsFor(dossier);
  assert.ok(violations.includes("$.release.preview.commit must match $.release.commit."));
  assert.ok(
    violations.includes("$.stages.windowsPrinter.releaseCommit must match $.release.commit."),
  );
  assert.ok(
    violations.includes(
      "$.stages.accessibilityLanguage.previewDeploymentId must match $.release.preview.deploymentId.",
    ),
  );
});

test("rejects an incomplete locale set and reused native reviewer", () => {
  const dossier = completeDossier();
  dossier.stages.accessibilityLanguage.locales.pop();
  dossier.stages.accessibilityLanguage.locales[1].reviewerRef =
    dossier.stages.accessibilityLanguage.locales[0].reviewerRef;
  const violations = violationsFor(dossier);
  assert.ok(
    violations.includes(
      '$.stages.accessibilityLanguage.locales is missing required locale "zh-CN".',
    ),
  );
  assert.ok(
    violations.includes(
      "$.stages.accessibilityLanguage.locales must have a distinct qualified native reviewer for every locale.",
    ),
  );
});

test("rejects normalized-but-impossible calendar timestamps and expired approvals", () => {
  const dossier = completeDossier();
  dossier.stages.providerPreview.completedAtUtc = "2026-02-31T01:00:00Z";
  dossier.stages.institutionalApproval.decisions[0].reviewByUtc = "2026-01-01T07:30:00Z";
  const violations = violationsFor(dossier);
  assert.ok(
    violations.includes("$.stages.providerPreview.completedAtUtc must be a valid UTC timestamp."),
  );
  assert.ok(
    violations.includes(
      "$.stages.institutionalApproval.decisions[0].reviewByUtc must be unexpired when the dossier is generated.",
    ),
  );
});

test("rejects reused physical witnesses and provider resource identities", () => {
  const dossier = completeDossier();
  dossier.stages.windowsPrinter.witnesses[1].witnessRef =
    dossier.stages.windowsPrinter.witnesses[0].witnessRef;
  dossier.stages.providerPreview.resources[1].resourceRef =
    dossier.stages.providerPreview.resources[0].resourceRef;
  const violations = violationsFor(dossier);
  assert.ok(
    violations.includes(
      "$.stages.windowsPrinter.witnesses must identify a distinct witness for every required role.",
    ),
  );
  assert.ok(
    violations.includes(
      "$.stages.providerPreview.resources must reference three distinct isolated resources.",
    ),
  );
});

test("rejects physical acceptance that predates its signed release", () => {
  const dossier = completeDossier();
  dossier.stages.windowsPrinter.completedAtUtc = "2026-01-01T02:30:00Z";
  const violations = violationsFor(dossier);
  assert.ok(
    violations.includes("$.stages.windowsPrinter must not predate the signed release evidence."),
  );
});

test("rejects a drill that touched Production, used personal data, or missed objectives", () => {
  const dossier = completeDossier();
  dossier.stages.incidentRollback.productionTouched = true;
  dossier.stages.incidentRollback.realPersonalDataUsed = true;
  dossier.stages.incidentRollback.recoveryObjectives.rtoActualMinutes = 61;
  const violations = violationsFor(dossier);
  assert.ok(violations.includes("$.stages.incidentRollback.productionTouched must equal false."));
  assert.ok(
    violations.includes("$.stages.incidentRollback.realPersonalDataUsed must equal false."),
  );
  assert.ok(
    violations.includes(
      "$.stages.incidentRollback.recoveryObjectives.rtoActualMinutes must not exceed the target.",
    ),
  );
});

test("rejects a drill whose independent observer also controls or records it", () => {
  const dossier = completeDossier();
  const roles = dossier.stages.incidentRollback.roles;
  const observer = roles.find((entry) => entry.role === "independent-observer");
  roles.find((entry) => entry.role === "incident-commander").ownerRef = observer.ownerRef;
  roles.find((entry) => entry.role === "evidence-recorder").ownerRef = observer.ownerRef;
  const violations = violationsFor(dossier);
  assert.ok(
    violations.includes(
      "$.stages.incidentRollback.roles must separate the incident commander and independent observer.",
    ),
  );
  assert.ok(
    violations.includes(
      "$.stages.incidentRollback.roles must separate the evidence recorder and independent observer.",
    ),
  );
});

test("rejects an approval recorded before its evidence and a premature final go/no-go", () => {
  const dossier = completeDossier();
  const decisions = dossier.stages.institutionalApproval.decisions;
  decisions.find((entry) => entry.gate === "accessibility-content").decidedAtUtc =
    "2026-01-01T04:30:00Z";
  decisions.find((entry) => entry.gate === "final-go-no-go").decidedAtUtc = "2026-01-01T05:30:00Z";
  const violations = violationsFor(dossier);
  assert.ok(
    violations.includes(
      '$.stages.institutionalApproval.decisions gate "accessibility-content" predates its required evidence.',
    ),
  );
  assert.ok(
    violations.includes(
      "$.stages.institutionalApproval.decisions final-go-no-go must follow every required evidence stage.",
    ),
  );
});

test("rejects fields intended to carry live secrets, signed URLs, or personal names", () => {
  const dossier = completeDossier();
  dossier.stages.providerPreview.signedUrl = "redacted";
  dossier.stages.windowsPrinter.personName = "redacted";
  dossier.stages.incidentRollback.secretValue = "redacted";
  const violations = violationsFor(dossier);
  assert.ok(
    violations.includes(
      "$.stages.providerPreview.signedUrl is a forbidden sensitive evidence field.",
    ),
  );
  assert.ok(
    violations.includes(
      "$.stages.windowsPrinter.personName is a forbidden sensitive evidence field.",
    ),
  );
  assert.ok(
    violations.includes(
      "$.stages.incidentRollback.secretValue is a forbidden sensitive evidence field.",
    ),
  );
});
