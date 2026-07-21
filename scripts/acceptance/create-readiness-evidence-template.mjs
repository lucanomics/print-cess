#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
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
} from "./readiness-evidence-policy.mjs";

function usage() {
  return "Usage: node scripts/acceptance/create-readiness-evidence-template.mjs --output <private-dossier.json>";
}

function parseOutputPath(arguments_) {
  if (arguments_.length !== 2 || arguments_[0] !== "--output" || !arguments_[1]) {
    throw new Error(usage());
  }
  return resolve(arguments_[1]);
}

function evidenceRefs() {
  return [{ recordId: "", sha256: "", sanitized: false }];
}

function pendingChecks(ids) {
  return ids.map((id) => ({ id, passed: false }));
}

function createTemplate() {
  return {
    schemaVersion: 1,
    templateOnly: true,
    product: "Print-cess by Paradiso",
    generatedAtUtc: "",
    syntheticDocumentsOnly: true,
    productionTouched: false,
    sanitization: {
      containsPersonalData: false,
      containsCredentials: false,
      containsLiveQrOrSignedUrl: false,
      containsDocumentContent: false,
    },
    release: {
      tag: "",
      commit: "",
      protocolVersion: 1,
      signingManifestSha256: "",
      executableSha256: "",
      signerThumbprint: "",
      preview: {
        environment: "Preview",
        deploymentId: "",
        commit: "",
        production: false,
      },
    },
    stages: {
      providerPreview: {
        status: "not-run",
        completedAtUtc: "",
        releaseCommit: "",
        previewDeploymentId: "",
        syntheticOnly: true,
        isolatedFromProduction: false,
        credentialsScopedToPreview: false,
        resources: REQUIRED_PROVIDER_RESOURCES.map((kind) => ({
          kind,
          resourceRef: "",
          approvalRecordId: "",
          configurationSha256: "",
          productionResource: false,
        })),
        checks: pendingChecks(REQUIRED_PROVIDER_CHECKS),
        evidenceRefs: evidenceRefs(),
      },
      windowsPrinter: {
        status: "not-run",
        completedAtUtc: "",
        releaseCommit: "",
        releaseTag: "",
        signingManifestSha256: "",
        executableSha256: "",
        signerThumbprint: "",
        collectorEvidenceSha256: "",
        deviceConfigurationSha256: "",
        printerConfigurationSha256: "",
        spoolRetentionDecisionId: "",
        syntheticOnly: true,
        physicalOutputDestroyed: false,
        noAutomaticUncertainRetry: false,
        tests: pendingChecks(REQUIRED_WINDOWS_TESTS),
        witnesses: REQUIRED_WINDOWS_WITNESS_ROLES.map((role) => ({
          role,
          witnessRef: "",
          attestationRecordId: "",
          attestationSha256: "",
        })),
        evidenceRefs: evidenceRefs(),
      },
      repositorySecurity: {
        status: "not-run",
        completedAtUtc: "",
        releaseCommit: "",
        branchProtectionEvidenceSha256: "",
        releaseTagRulesetEvidenceSha256: "",
        independentReviewerRef: "",
        repositoryAdministratorRef: "",
        requiredChecks: REQUIRED_REPOSITORY_CHECKS.map((name) => ({
          name,
          required: false,
          passed: false,
        })),
        codeql: {
          enabled: false,
          configuration: "",
          languages: [...REQUIRED_CODEQL_LANGUAGES],
        },
        secretScanning: {
          enabled: false,
          pushProtectionEnabled: false,
          helperScanPassed: false,
        },
        evidenceRefs: evidenceRefs(),
      },
      authenticode: {
        status: "not-run",
        completedAtUtc: "",
        releaseCommit: "",
        releaseTag: "",
        signingManifestSha256: "",
        executableSha256: "",
        signerThumbprint: "",
        signatureValid: false,
        timestampPresent: false,
        timestampDigest: "",
        certificateCurrentlyValid: false,
        malwareScanPassed: false,
        targetDeviceReverified: false,
        certificateCustodyDecisionId: "",
        signingEvidenceSha256: "",
        targetVerificationEvidenceSha256: "",
        evidenceRefs: evidenceRefs(),
      },
      accessibilityLanguage: {
        status: "not-run",
        completedAtUtc: "",
        releaseCommit: "",
        previewDeploymentId: "",
        syntheticOnly: true,
        productAccessibilityOwnerRef: "",
        ownerAttestationRecordId: "",
        ownerAttestationSha256: "",
        devices: REQUIRED_ACCESSIBILITY_DEVICES.map((id) => ({
          id,
          configurationSha256: "",
          passed: false,
        })),
        mobileCarrierRefs: ["", ""],
        checks: pendingChecks(REQUIRED_ACCESSIBILITY_CHECKS),
        locales: REQUIRED_LOCALES.map((locale) => ({
          locale,
          reviewerRef: "",
          qualifiedNativeReviewer: false,
          visibleTextReviewedInContext: false,
          speechReviewedInContext: false,
          passed: false,
          attestationRecordId: "",
          attestationSha256: "",
        })),
        evidenceRefs: evidenceRefs(),
      },
      incidentRollback: {
        status: "not-run",
        completedAtUtc: "",
        releaseCommit: "",
        previewDeploymentId: "",
        authorizedDrillWindow: false,
        previewOnly: true,
        productionTouched: false,
        realPersonalDataUsed: false,
        realCredentialRevoked: false,
        oldSyntheticCredentialRejected: false,
        activeSessionsZeroBeforeRollback: false,
        orphanCleanupBoundedAndIdempotent: false,
        knownGoodSignedArtifactVerified: false,
        noUncertainJobReprinted: false,
        allGapsHaveOwnerAndDueDate: false,
        drillAuthorizationRecordId: "",
        roles: REQUIRED_DRILL_ROLES.map((role) => ({ role, ownerRef: "" })),
        steps: pendingChecks(REQUIRED_DRILL_STEPS),
        recoveryObjectives: {
          rtoTargetMinutes: null,
          rtoActualMinutes: null,
          rpoTargetMinutes: null,
          rpoActualMinutes: null,
        },
        evidenceRefs: evidenceRefs(),
      },
      institutionalApproval: {
        status: "not-approved",
        completedAtUtc: "",
        releaseCommit: "",
        previewDeploymentId: "",
        allConditionsAccepted: false,
        launchWindowApproved: false,
        rollbackAuthorityNamed: false,
        decisions: REQUIRED_APPROVAL_GATES.map((gate) => ({
          gate,
          decision: "not-approved",
          decidedAtUtc: "",
          reviewByUtc: "",
          approverRef: "",
          decisionRecordId: "",
          attestationSha256: "",
          scopeCommit: "",
          conditionsAccepted: false,
        })),
        evidenceRefs: evidenceRefs(),
      },
    },
  };
}

try {
  const outputPath = parseOutputPath(process.argv.slice(2));
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(createTemplate(), null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
  process.stdout.write(`Incomplete private readiness template created at ${outputPath}.\n`);
  process.stdout.write("It must fail validation until every external gate is completed.\n");
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
