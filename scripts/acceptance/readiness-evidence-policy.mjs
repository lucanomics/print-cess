const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const SHA1_PATTERN = /^[0-9a-f]{40}$/;
const RELEASE_TAG_PATTERN = /^v\d+\.\d+\.\d+(?:-[0-9A-Za-z][0-9A-Za-z.-]*)?$/;
const RECORD_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{5,127}$/;
const UTC_TIMESTAMP_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?Z$/;

export const REQUIRED_PROVIDER_RESOURCES = ["blob", "qstash", "redis"];
export const REQUIRED_PROVIDER_CHECKS = [
  "blob-delegation-expiry",
  "blob-no-overwrite",
  "blob-operation-path-scope",
  "blob-upload-size-limit",
  "cleanup-idempotent",
  "cleanup-race-safe",
  "preview-production-isolation",
  "qstash-signed-delivery",
  "redis-atomic-claim",
  "redis-consume-once",
  "redis-terminal-state",
];
export const REQUIRED_WINDOWS_TESTS = [
  "assigned-access-reboot-update-rollback",
  "completed-user-reset",
  "fault-disconnect-upload-download",
  "fault-offline-paper-paused",
  "file-jpg",
  "file-pdf-one-page",
  "file-pdf-two-pages",
  "file-png",
  "power-loss-submit-boundary",
  "repeat-approve-refresh-back-restart",
  "ten-sequential-sessions",
  "two-phone-one-qr-race",
  "wrong-printer-or-defaults",
];
export const REQUIRED_WINDOWS_WITNESS_ROLES = [
  "application-security",
  "endpoint-administration",
  "printer-operations",
  "privacy-security",
  "site-operations",
];
export const REQUIRED_REPOSITORY_CHECKS = [
  "Dependency audit",
  "Secret scan helper",
  "Web",
  "Windows kiosk",
];
export const REQUIRED_CODEQL_LANGUAGES = ["csharp", "javascript-typescript"];
export const REQUIRED_ACCESSIBILITY_DEVICES = [
  "android-chrome-large",
  "android-chrome-small",
  "iphone-safari-large",
  "iphone-safari-small",
  "windows-kiosk-target",
];
export const REQUIRED_ACCESSIBILITY_CHECKS = [
  "contrast-text-nontext-focus",
  "focus-and-error-announcements",
  "high-contrast",
  "keyboard-only",
  "large-actions-64px",
  "reduced-motion",
  "reflow-400-percent",
  "speech-unavailable-and-muted",
  "talkback",
  "text-zoom-200-percent",
  "voiceover",
  "windows-screen-reader",
];
export const REQUIRED_LOCALES = ["en", "ko", "mn", "ne", "ru", "th", "vi", "zh-CN"];
export const REQUIRED_DRILL_ROLES = [
  "application-security-lead",
  "communications-owner",
  "evidence-recorder",
  "incident-commander",
  "independent-observer",
  "printer-site-operator",
  "privacy-officer",
  "upstash-owner",
  "vercel-owner",
  "windows-endpoint-owner",
];
export const REQUIRED_DRILL_STEPS = [
  "declare-and-contain",
  "kiosk-rollback",
  "printer-ambiguity",
  "privacy-escalation",
  "provider-cleanup-outage",
  "restore-and-monitor",
  "web-rollback",
];
export const REQUIRED_APPROVAL_GATES = [
  "accessibility-content",
  "brand-service-ownership",
  "final-go-no-go",
  "incident-readiness",
  "information-security",
  "printer-site-operations",
  "privacy-legal",
  "procurement-provider",
  "windows-endpoint",
];

const FORBIDDEN_SENSITIVE_KEY_PARTS = [
  "contactdetails",
  "documentpreview",
  "personname",
  "qrfragment",
  "signedurl",
  "tokenvalue",
  "secretvalue",
];
const ALLOWED_SAFETY_ASSERTION_KEYS = new Set(["containsLiveQrOrSignedUrl"]);

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function canonicalKey(value) {
  return value.replace(/[^A-Za-z0-9]/g, "").toLowerCase();
}

function scanForbiddenKeys(value, path, violations) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => scanForbiddenKeys(entry, `${path}[${index}]`, violations));
    return;
  }
  if (!isObject(value)) return;

  for (const [key, child] of Object.entries(value)) {
    const normalized = canonicalKey(key);
    if (
      !ALLOWED_SAFETY_ASSERTION_KEYS.has(key) &&
      FORBIDDEN_SENSITIVE_KEY_PARTS.some((part) => normalized.includes(part))
    ) {
      violations.push(`${path}.${key} is a forbidden sensitive evidence field.`);
    }
    scanForbiddenKeys(child, `${path}.${key}`, violations);
  }
}

function requiredObject(parent, key, path, violations) {
  const value = parent?.[key];
  if (!isObject(value)) {
    violations.push(`${path}.${key} must be an object.`);
    return {};
  }
  return value;
}

function requiredArray(parent, key, path, violations) {
  const value = parent?.[key];
  if (!Array.isArray(value)) {
    violations.push(`${path}.${key} must be an array.`);
    return [];
  }
  return value;
}

function requiredString(parent, key, path, violations, pattern) {
  const value = parent?.[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    violations.push(`${path}.${key} must be a non-empty string.`);
    return "";
  }
  if (pattern && !pattern.test(value)) {
    violations.push(`${path}.${key} has an invalid format.`);
  }
  return value;
}

function requiredExact(parent, key, expected, path, violations) {
  const value = parent?.[key];
  if (value !== expected) {
    violations.push(`${path}.${key} must equal ${JSON.stringify(expected)}.`);
  }
  return value;
}

function requiredNonNegativeNumber(parent, key, path, violations) {
  const value = parent?.[key];
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    violations.push(`${path}.${key} must be a non-negative finite number.`);
    return Number.NaN;
  }
  return value;
}

function requiredTimestamp(parent, key, path, violations) {
  const value = requiredString(parent, key, path, violations, UTC_TIMESTAMP_PATTERN);
  if (!value) return Number.NaN;
  const match = UTC_TIMESTAMP_PATTERN.exec(value);
  const timestamp = Date.parse(value);
  const date = new Date(timestamp);
  const calendarPartsMatch =
    match &&
    date.getUTCFullYear() === Number(match[1]) &&
    date.getUTCMonth() + 1 === Number(match[2]) &&
    date.getUTCDate() === Number(match[3]) &&
    date.getUTCHours() === Number(match[4]) &&
    date.getUTCMinutes() === Number(match[5]) &&
    date.getUTCSeconds() === Number(match[6]);
  if (!Number.isFinite(timestamp) || !calendarPartsMatch) {
    violations.push(`${path}.${key} must be a valid UTC timestamp.`);
    return Number.NaN;
  }
  return timestamp;
}

function requiredRecordId(parent, key, path, violations) {
  return requiredString(parent, key, path, violations, RECORD_ID_PATTERN);
}

function requiredEvidenceRefs(parent, path, violations) {
  const evidenceRefs = requiredArray(parent, "evidenceRefs", path, violations);
  if (evidenceRefs.length === 0) {
    violations.push(`${path}.evidenceRefs must contain at least one sanitized evidence reference.`);
  }
  evidenceRefs.forEach((reference, index) => {
    const refPath = `${path}.evidenceRefs[${index}]`;
    if (!isObject(reference)) {
      violations.push(`${refPath} must be an object.`);
      return;
    }
    requiredRecordId(reference, "recordId", refPath, violations);
    requiredString(reference, "sha256", refPath, violations, SHA256_PATTERN);
    requiredExact(reference, "sanitized", true, refPath, violations);
  });
}

function requireCompleteNamedSet(
  items,
  requiredNames,
  nameKey,
  path,
  violations,
  allowAdditional = false,
) {
  const names = [];
  items.forEach((item, index) => {
    const itemPath = `${path}[${index}]`;
    if (!isObject(item)) {
      violations.push(`${itemPath} must be an object.`);
      return;
    }
    const name = requiredString(item, nameKey, itemPath, violations);
    if (name) names.push(name);
  });

  for (const requiredName of requiredNames) {
    if (!names.includes(requiredName)) {
      violations.push(`${path} is missing required ${nameKey} ${JSON.stringify(requiredName)}.`);
    }
  }
  for (const name of new Set(names)) {
    if (!allowAdditional && !requiredNames.includes(name)) {
      violations.push(`${path} contains unsupported ${nameKey} ${JSON.stringify(name)}.`);
    }
  }
  if (new Set(names).size !== names.length) {
    violations.push(`${path} must not contain duplicate ${nameKey} values.`);
  }
  if (
    (!allowAdditional && items.length !== requiredNames.length) ||
    (allowAdditional && items.length < requiredNames.length)
  ) {
    violations.push(
      allowAdditional
        ? `${path} must contain at least ${requiredNames.length} required entries.`
        : `${path} must contain exactly ${requiredNames.length} required entries.`,
    );
  }
}

function requirePassedChecks(parent, key, requiredIds, path, violations) {
  const checks = requiredArray(parent, key, path, violations);
  const checksPath = `${path}.${key}`;
  requireCompleteNamedSet(checks, requiredIds, "id", checksPath, violations, true);
  checks.forEach((check, index) => {
    if (isObject(check))
      requiredExact(check, "passed", true, `${checksPath}[${index}]`, violations);
  });
}

function requireReleaseBinding(stage, stagePath, release, violations) {
  const commit = requiredString(stage, "releaseCommit", stagePath, violations, SHA1_PATTERN);
  if (commit && release.commit && commit !== release.commit) {
    violations.push(`${stagePath}.releaseCommit must match $.release.commit.`);
  }
}

function requirePreviewBinding(stage, stagePath, release, violations) {
  const deploymentId = requiredString(stage, "previewDeploymentId", stagePath, violations);
  if (
    deploymentId &&
    release.preview.deploymentId &&
    deploymentId !== release.preview.deploymentId
  ) {
    violations.push(`${stagePath}.previewDeploymentId must match $.release.preview.deploymentId.`);
  }
}

function validateProviderStage(stage, release, violations) {
  const path = "$.stages.providerPreview";
  requiredExact(stage, "status", "passed", path, violations);
  const completedAt = requiredTimestamp(stage, "completedAtUtc", path, violations);
  requireReleaseBinding(stage, path, release, violations);
  requirePreviewBinding(stage, path, release, violations);
  requiredExact(stage, "syntheticOnly", true, path, violations);
  requiredExact(stage, "isolatedFromProduction", true, path, violations);
  requiredExact(stage, "credentialsScopedToPreview", true, path, violations);

  const resources = requiredArray(stage, "resources", path, violations);
  requireCompleteNamedSet(
    resources,
    REQUIRED_PROVIDER_RESOURCES,
    "kind",
    `${path}.resources`,
    violations,
  );
  const resourceRefs = [];
  resources.forEach((resource, index) => {
    if (!isObject(resource)) return;
    const resourcePath = `${path}.resources[${index}]`;
    const resourceRef = requiredRecordId(resource, "resourceRef", resourcePath, violations);
    if (resourceRef) resourceRefs.push(resourceRef);
    requiredRecordId(resource, "approvalRecordId", resourcePath, violations);
    requiredString(resource, "configurationSha256", resourcePath, violations, SHA256_PATTERN);
    requiredExact(resource, "productionResource", false, resourcePath, violations);
  });
  if (new Set(resourceRefs).size !== REQUIRED_PROVIDER_RESOURCES.length) {
    violations.push(`${path}.resources must reference three distinct isolated resources.`);
  }
  requirePassedChecks(stage, "checks", REQUIRED_PROVIDER_CHECKS, path, violations);
  requiredEvidenceRefs(stage, path, violations);
  return completedAt;
}

function validateWindowsStage(stage, release, violations) {
  const path = "$.stages.windowsPrinter";
  requiredExact(stage, "status", "passed", path, violations);
  const completedAt = requiredTimestamp(stage, "completedAtUtc", path, violations);
  requireReleaseBinding(stage, path, release, violations);
  requiredExact(stage, "releaseTag", release.tag, path, violations);
  requiredExact(stage, "signingManifestSha256", release.signingManifestSha256, path, violations);
  requiredExact(stage, "executableSha256", release.executableSha256, path, violations);
  requiredExact(stage, "signerThumbprint", release.signerThumbprint, path, violations);
  requiredString(stage, "collectorEvidenceSha256", path, violations, SHA256_PATTERN);
  requiredString(stage, "deviceConfigurationSha256", path, violations, SHA256_PATTERN);
  requiredString(stage, "printerConfigurationSha256", path, violations, SHA256_PATTERN);
  requiredRecordId(stage, "spoolRetentionDecisionId", path, violations);
  requiredExact(stage, "syntheticOnly", true, path, violations);
  requiredExact(stage, "physicalOutputDestroyed", true, path, violations);
  requiredExact(stage, "noAutomaticUncertainRetry", true, path, violations);

  requirePassedChecks(stage, "tests", REQUIRED_WINDOWS_TESTS, path, violations);
  const witnesses = requiredArray(stage, "witnesses", path, violations);
  requireCompleteNamedSet(
    witnesses,
    REQUIRED_WINDOWS_WITNESS_ROLES,
    "role",
    `${path}.witnesses`,
    violations,
  );
  const witnessRefs = [];
  const witnessAttestations = [];
  witnesses.forEach((witness, index) => {
    if (!isObject(witness)) return;
    const witnessPath = `${path}.witnesses[${index}]`;
    const witnessRef = requiredRecordId(witness, "witnessRef", witnessPath, violations);
    const attestationRecordId = requiredRecordId(
      witness,
      "attestationRecordId",
      witnessPath,
      violations,
    );
    if (witnessRef) witnessRefs.push(witnessRef);
    if (attestationRecordId) witnessAttestations.push(attestationRecordId);
    requiredString(witness, "attestationSha256", witnessPath, violations, SHA256_PATTERN);
  });
  if (new Set(witnessRefs).size !== REQUIRED_WINDOWS_WITNESS_ROLES.length) {
    violations.push(`${path}.witnesses must identify a distinct witness for every required role.`);
  }
  if (new Set(witnessAttestations).size !== REQUIRED_WINDOWS_WITNESS_ROLES.length) {
    violations.push(
      `${path}.witnesses must reference a distinct attestation for every required role.`,
    );
  }
  requiredEvidenceRefs(stage, path, violations);
  return completedAt;
}

function validateRepositorySecurityStage(stage, release, violations) {
  const path = "$.stages.repositorySecurity";
  requiredExact(stage, "status", "passed", path, violations);
  const completedAt = requiredTimestamp(stage, "completedAtUtc", path, violations);
  requireReleaseBinding(stage, path, release, violations);
  requiredString(stage, "branchProtectionEvidenceSha256", path, violations, SHA256_PATTERN);
  requiredString(stage, "releaseTagRulesetEvidenceSha256", path, violations, SHA256_PATTERN);
  requiredRecordId(stage, "independentReviewerRef", path, violations);
  requiredRecordId(stage, "repositoryAdministratorRef", path, violations);
  if (
    stage.independentReviewerRef &&
    stage.repositoryAdministratorRef &&
    stage.independentReviewerRef === stage.repositoryAdministratorRef
  ) {
    violations.push(`${path}.independentReviewerRef must differ from repositoryAdministratorRef.`);
  }

  const checks = requiredArray(stage, "requiredChecks", path, violations);
  requireCompleteNamedSet(
    checks,
    REQUIRED_REPOSITORY_CHECKS,
    "name",
    `${path}.requiredChecks`,
    violations,
    true,
  );
  checks.forEach((check, index) => {
    if (!isObject(check)) return;
    const checkPath = `${path}.requiredChecks[${index}]`;
    requiredExact(check, "required", true, checkPath, violations);
    requiredExact(check, "passed", true, checkPath, violations);
  });

  const codeql = requiredObject(stage, "codeql", path, violations);
  requiredExact(codeql, "enabled", true, `${path}.codeql`, violations);
  const codeqlConfiguration = requiredString(codeql, "configuration", `${path}.codeql`, violations);
  if (codeqlConfiguration && !["advanced", "default"].includes(codeqlConfiguration)) {
    violations.push(`${path}.codeql.configuration must be "default" or "advanced".`);
  }
  const languages = requiredArray(codeql, "languages", `${path}.codeql`, violations);
  const languageObjects = languages.map((language) => ({ language }));
  requireCompleteNamedSet(
    languageObjects,
    REQUIRED_CODEQL_LANGUAGES,
    "language",
    `${path}.codeql.languages`,
    violations,
    true,
  );

  const secretScanning = requiredObject(stage, "secretScanning", path, violations);
  requiredExact(secretScanning, "enabled", true, `${path}.secretScanning`, violations);
  requiredExact(
    secretScanning,
    "pushProtectionEnabled",
    true,
    `${path}.secretScanning`,
    violations,
  );
  requiredExact(secretScanning, "helperScanPassed", true, `${path}.secretScanning`, violations);
  requiredEvidenceRefs(stage, path, violations);
  return completedAt;
}

function validateAuthenticodeStage(stage, release, violations) {
  const path = "$.stages.authenticode";
  requiredExact(stage, "status", "passed", path, violations);
  const completedAt = requiredTimestamp(stage, "completedAtUtc", path, violations);
  requireReleaseBinding(stage, path, release, violations);
  requiredExact(stage, "releaseTag", release.tag, path, violations);
  requiredExact(stage, "signingManifestSha256", release.signingManifestSha256, path, violations);
  requiredExact(stage, "executableSha256", release.executableSha256, path, violations);
  requiredExact(stage, "signerThumbprint", release.signerThumbprint, path, violations);
  requiredExact(stage, "signatureValid", true, path, violations);
  requiredExact(stage, "timestampPresent", true, path, violations);
  requiredExact(stage, "timestampDigest", "sha256", path, violations);
  requiredExact(stage, "certificateCurrentlyValid", true, path, violations);
  requiredExact(stage, "malwareScanPassed", true, path, violations);
  requiredExact(stage, "targetDeviceReverified", true, path, violations);
  requiredRecordId(stage, "certificateCustodyDecisionId", path, violations);
  requiredString(stage, "signingEvidenceSha256", path, violations, SHA256_PATTERN);
  requiredString(stage, "targetVerificationEvidenceSha256", path, violations, SHA256_PATTERN);
  requiredEvidenceRefs(stage, path, violations);
  return completedAt;
}

function validateAccessibilityStage(stage, release, violations) {
  const path = "$.stages.accessibilityLanguage";
  requiredExact(stage, "status", "passed", path, violations);
  const completedAt = requiredTimestamp(stage, "completedAtUtc", path, violations);
  requireReleaseBinding(stage, path, release, violations);
  requirePreviewBinding(stage, path, release, violations);
  requiredExact(stage, "syntheticOnly", true, path, violations);
  requiredRecordId(stage, "productAccessibilityOwnerRef", path, violations);
  requiredRecordId(stage, "ownerAttestationRecordId", path, violations);
  requiredString(stage, "ownerAttestationSha256", path, violations, SHA256_PATTERN);

  const devices = requiredArray(stage, "devices", path, violations);
  requireCompleteNamedSet(
    devices,
    REQUIRED_ACCESSIBILITY_DEVICES,
    "id",
    `${path}.devices`,
    violations,
    true,
  );
  devices.forEach((device, index) => {
    if (!isObject(device)) return;
    const devicePath = `${path}.devices[${index}]`;
    requiredString(device, "configurationSha256", devicePath, violations, SHA256_PATTERN);
    requiredExact(device, "passed", true, devicePath, violations);
  });

  const carrierRefs = requiredArray(stage, "mobileCarrierRefs", path, violations);
  if (carrierRefs.length < 2 || new Set(carrierRefs).size < 2) {
    violations.push(
      `${path}.mobileCarrierRefs must identify at least two distinct approved carriers.`,
    );
  }
  carrierRefs.forEach((carrierRef, index) => {
    if (typeof carrierRef !== "string" || !RECORD_ID_PATTERN.test(carrierRef)) {
      violations.push(`${path}.mobileCarrierRefs[${index}] must be an opaque record ID.`);
    }
  });

  requirePassedChecks(stage, "checks", REQUIRED_ACCESSIBILITY_CHECKS, path, violations);
  const locales = requiredArray(stage, "locales", path, violations);
  requireCompleteNamedSet(locales, REQUIRED_LOCALES, "locale", `${path}.locales`, violations);
  const reviewerRefs = [];
  const localeAttestations = [];
  locales.forEach((locale, index) => {
    if (!isObject(locale)) return;
    const localePath = `${path}.locales[${index}]`;
    const reviewerRef = requiredRecordId(locale, "reviewerRef", localePath, violations);
    if (reviewerRef) reviewerRefs.push(reviewerRef);
    requiredExact(locale, "qualifiedNativeReviewer", true, localePath, violations);
    requiredExact(locale, "visibleTextReviewedInContext", true, localePath, violations);
    requiredExact(locale, "speechReviewedInContext", true, localePath, violations);
    requiredExact(locale, "passed", true, localePath, violations);
    const attestationRecordId = requiredRecordId(
      locale,
      "attestationRecordId",
      localePath,
      violations,
    );
    if (attestationRecordId) localeAttestations.push(attestationRecordId);
    requiredString(locale, "attestationSha256", localePath, violations, SHA256_PATTERN);
  });
  if (new Set(reviewerRefs).size !== REQUIRED_LOCALES.length) {
    violations.push(
      `${path}.locales must have a distinct qualified native reviewer for every locale.`,
    );
  }
  if (new Set(localeAttestations).size !== REQUIRED_LOCALES.length) {
    violations.push(`${path}.locales must reference a distinct attestation for every locale.`);
  }
  requiredEvidenceRefs(stage, path, violations);
  return completedAt;
}

function validateIncidentStage(stage, release, violations) {
  const path = "$.stages.incidentRollback";
  requiredExact(stage, "status", "passed", path, violations);
  const completedAt = requiredTimestamp(stage, "completedAtUtc", path, violations);
  requireReleaseBinding(stage, path, release, violations);
  requirePreviewBinding(stage, path, release, violations);
  requiredExact(stage, "authorizedDrillWindow", true, path, violations);
  requiredExact(stage, "previewOnly", true, path, violations);
  requiredExact(stage, "productionTouched", false, path, violations);
  requiredExact(stage, "realPersonalDataUsed", false, path, violations);
  requiredExact(stage, "realCredentialRevoked", false, path, violations);
  requiredExact(stage, "oldSyntheticCredentialRejected", true, path, violations);
  requiredExact(stage, "activeSessionsZeroBeforeRollback", true, path, violations);
  requiredExact(stage, "orphanCleanupBoundedAndIdempotent", true, path, violations);
  requiredExact(stage, "knownGoodSignedArtifactVerified", true, path, violations);
  requiredExact(stage, "noUncertainJobReprinted", true, path, violations);
  requiredExact(stage, "allGapsHaveOwnerAndDueDate", true, path, violations);
  requiredRecordId(stage, "drillAuthorizationRecordId", path, violations);

  const roles = requiredArray(stage, "roles", path, violations);
  requireCompleteNamedSet(roles, REQUIRED_DRILL_ROLES, "role", `${path}.roles`, violations);
  const refsByRole = new Map();
  roles.forEach((role, index) => {
    if (!isObject(role)) return;
    const rolePath = `${path}.roles[${index}]`;
    const roleName = role.role;
    const ownerRef = requiredRecordId(role, "ownerRef", rolePath, violations);
    if (roleName && ownerRef) refsByRole.set(roleName, ownerRef);
  });
  if (
    refsByRole.get("incident-commander") &&
    refsByRole.get("incident-commander") === refsByRole.get("independent-observer")
  ) {
    violations.push(`${path}.roles must separate the incident commander and independent observer.`);
  }
  if (
    refsByRole.get("evidence-recorder") &&
    refsByRole.get("evidence-recorder") === refsByRole.get("independent-observer")
  ) {
    violations.push(`${path}.roles must separate the evidence recorder and independent observer.`);
  }

  requirePassedChecks(stage, "steps", REQUIRED_DRILL_STEPS, path, violations);
  const objectives = requiredObject(stage, "recoveryObjectives", path, violations);
  const rtoTarget = requiredNonNegativeNumber(
    objectives,
    "rtoTargetMinutes",
    `${path}.recoveryObjectives`,
    violations,
  );
  const rtoActual = requiredNonNegativeNumber(
    objectives,
    "rtoActualMinutes",
    `${path}.recoveryObjectives`,
    violations,
  );
  const rpoTarget = requiredNonNegativeNumber(
    objectives,
    "rpoTargetMinutes",
    `${path}.recoveryObjectives`,
    violations,
  );
  const rpoActual = requiredNonNegativeNumber(
    objectives,
    "rpoActualMinutes",
    `${path}.recoveryObjectives`,
    violations,
  );
  if (Number.isFinite(rtoTarget) && Number.isFinite(rtoActual) && rtoActual > rtoTarget) {
    violations.push(`${path}.recoveryObjectives.rtoActualMinutes must not exceed the target.`);
  }
  if (Number.isFinite(rpoTarget) && Number.isFinite(rpoActual) && rpoActual > rpoTarget) {
    violations.push(`${path}.recoveryObjectives.rpoActualMinutes must not exceed the target.`);
  }
  requiredEvidenceRefs(stage, path, violations);
  return completedAt;
}

function validateInstitutionalStage(stage, release, stageTimes, generatedAt, violations) {
  const path = "$.stages.institutionalApproval";
  requiredExact(stage, "status", "approved", path, violations);
  const completedAt = requiredTimestamp(stage, "completedAtUtc", path, violations);
  requireReleaseBinding(stage, path, release, violations);
  requirePreviewBinding(stage, path, release, violations);
  requiredExact(stage, "allConditionsAccepted", true, path, violations);
  requiredExact(stage, "launchWindowApproved", true, path, violations);
  requiredExact(stage, "rollbackAuthorityNamed", true, path, violations);

  const decisions = requiredArray(stage, "decisions", path, violations);
  requireCompleteNamedSet(
    decisions,
    REQUIRED_APPROVAL_GATES,
    "gate",
    `${path}.decisions`,
    violations,
  );
  const decisionTimes = new Map();
  const decisionRecordIds = [];
  decisions.forEach((decision, index) => {
    if (!isObject(decision)) return;
    const decisionPath = `${path}.decisions[${index}]`;
    requiredExact(decision, "decision", "approved", decisionPath, violations);
    const decidedAt = requiredTimestamp(decision, "decidedAtUtc", decisionPath, violations);
    const reviewBy = requiredTimestamp(decision, "reviewByUtc", decisionPath, violations);
    if (Number.isFinite(decidedAt) && Number.isFinite(reviewBy) && reviewBy <= decidedAt) {
      violations.push(`${decisionPath}.reviewByUtc must be later than decidedAtUtc.`);
    }
    if (Number.isFinite(reviewBy) && Number.isFinite(generatedAt) && reviewBy <= generatedAt) {
      violations.push(
        `${decisionPath}.reviewByUtc must be unexpired when the dossier is generated.`,
      );
    }
    requiredRecordId(decision, "approverRef", decisionPath, violations);
    const decisionRecordId = requiredRecordId(
      decision,
      "decisionRecordId",
      decisionPath,
      violations,
    );
    if (decisionRecordId) decisionRecordIds.push(decisionRecordId);
    requiredString(decision, "attestationSha256", decisionPath, violations, SHA256_PATTERN);
    requiredExact(decision, "scopeCommit", release.commit, decisionPath, violations);
    requiredExact(decision, "conditionsAccepted", true, decisionPath, violations);
    if (decision.gate) decisionTimes.set(decision.gate, decidedAt);
  });
  if (new Set(decisionRecordIds).size !== REQUIRED_APPROVAL_GATES.length) {
    violations.push(
      `${path}.decisions must reference a distinct immutable decision record per gate.`,
    );
  }

  const minimumDecisionTimes = new Map([
    ["procurement-provider", stageTimes.providerPreview],
    ["windows-endpoint", stageTimes.windowsPrinter],
    ["printer-site-operations", stageTimes.windowsPrinter],
    ["information-security", Math.max(stageTimes.repositorySecurity, stageTimes.authenticode)],
    ["accessibility-content", stageTimes.accessibilityLanguage],
    ["incident-readiness", stageTimes.incidentRollback],
  ]);
  for (const [gate, minimumTime] of minimumDecisionTimes) {
    const decisionTime = decisionTimes.get(gate);
    if (
      Number.isFinite(minimumTime) &&
      Number.isFinite(decisionTime) &&
      decisionTime < minimumTime
    ) {
      violations.push(
        `${path}.decisions gate ${JSON.stringify(gate)} predates its required evidence.`,
      );
    }
  }

  const finalDecisionTime = decisionTimes.get("final-go-no-go");
  const latestPriorStage = Math.max(
    stageTimes.providerPreview,
    stageTimes.windowsPrinter,
    stageTimes.repositorySecurity,
    stageTimes.authenticode,
    stageTimes.accessibilityLanguage,
    stageTimes.incidentRollback,
  );
  if (
    Number.isFinite(finalDecisionTime) &&
    Number.isFinite(latestPriorStage) &&
    finalDecisionTime < latestPriorStage
  ) {
    violations.push(`${path}.decisions final-go-no-go must follow every required evidence stage.`);
  }
  if (
    Number.isFinite(completedAt) &&
    Number.isFinite(finalDecisionTime) &&
    completedAt < finalDecisionTime
  ) {
    violations.push(`${path}.completedAtUtc must not predate the final go/no-go decision.`);
  }
  requiredEvidenceRefs(stage, path, violations);
  return completedAt;
}

export class ReadinessEvidencePolicyError extends Error {
  constructor(violations) {
    super(`Readiness evidence is incomplete (${violations.length} violation(s)).`);
    this.name = "ReadinessEvidencePolicyError";
    this.violations = violations;
  }
}

export function validateReadinessDossier(dossier) {
  const violations = [];
  if (!isObject(dossier)) {
    throw new ReadinessEvidencePolicyError(["$ must be an object."]);
  }
  scanForbiddenKeys(dossier, "$", violations);

  requiredExact(dossier, "schemaVersion", 1, "$", violations);
  requiredExact(dossier, "templateOnly", false, "$", violations);
  requiredExact(dossier, "product", "Print-cess by Paradiso", "$", violations);
  const generatedAt = requiredTimestamp(dossier, "generatedAtUtc", "$", violations);
  requiredExact(dossier, "syntheticDocumentsOnly", true, "$", violations);
  requiredExact(dossier, "productionTouched", false, "$", violations);

  const sanitization = requiredObject(dossier, "sanitization", "$", violations);
  requiredExact(sanitization, "containsPersonalData", false, "$.sanitization", violations);
  requiredExact(sanitization, "containsCredentials", false, "$.sanitization", violations);
  requiredExact(sanitization, "containsLiveQrOrSignedUrl", false, "$.sanitization", violations);
  requiredExact(sanitization, "containsDocumentContent", false, "$.sanitization", violations);

  const releaseObject = requiredObject(dossier, "release", "$", violations);
  const preview = requiredObject(releaseObject, "preview", "$.release", violations);
  const release = {
    tag: requiredString(releaseObject, "tag", "$.release", violations, RELEASE_TAG_PATTERN),
    commit: requiredString(releaseObject, "commit", "$.release", violations, SHA1_PATTERN),
    signingManifestSha256: requiredString(
      releaseObject,
      "signingManifestSha256",
      "$.release",
      violations,
      SHA256_PATTERN,
    ),
    executableSha256: requiredString(
      releaseObject,
      "executableSha256",
      "$.release",
      violations,
      SHA256_PATTERN,
    ),
    signerThumbprint: requiredString(
      releaseObject,
      "signerThumbprint",
      "$.release",
      violations,
      SHA1_PATTERN,
    ),
    preview: {
      deploymentId: requiredString(preview, "deploymentId", "$.release.preview", violations),
      commit: requiredString(preview, "commit", "$.release.preview", violations, SHA1_PATTERN),
    },
  };
  requiredExact(releaseObject, "protocolVersion", 1, "$.release", violations);
  requiredExact(preview, "environment", "Preview", "$.release.preview", violations);
  requiredExact(preview, "production", false, "$.release.preview", violations);
  if (release.preview.commit && release.commit && release.preview.commit !== release.commit) {
    violations.push("$.release.preview.commit must match $.release.commit.");
  }

  const stages = requiredObject(dossier, "stages", "$", violations);
  const providerPreview = requiredObject(stages, "providerPreview", "$.stages", violations);
  const windowsPrinter = requiredObject(stages, "windowsPrinter", "$.stages", violations);
  const repositorySecurity = requiredObject(stages, "repositorySecurity", "$.stages", violations);
  const authenticode = requiredObject(stages, "authenticode", "$.stages", violations);
  const accessibilityLanguage = requiredObject(
    stages,
    "accessibilityLanguage",
    "$.stages",
    violations,
  );
  const incidentRollback = requiredObject(stages, "incidentRollback", "$.stages", violations);
  const institutionalApproval = requiredObject(
    stages,
    "institutionalApproval",
    "$.stages",
    violations,
  );

  const stageTimes = {
    providerPreview: validateProviderStage(providerPreview, release, violations),
    windowsPrinter: validateWindowsStage(windowsPrinter, release, violations),
    repositorySecurity: validateRepositorySecurityStage(repositorySecurity, release, violations),
    authenticode: validateAuthenticodeStage(authenticode, release, violations),
    accessibilityLanguage: validateAccessibilityStage(accessibilityLanguage, release, violations),
    incidentRollback: validateIncidentStage(incidentRollback, release, violations),
  };
  stageTimes.institutionalApproval = validateInstitutionalStage(
    institutionalApproval,
    release,
    stageTimes,
    generatedAt,
    violations,
  );

  if (
    Number.isFinite(stageTimes.repositorySecurity) &&
    Number.isFinite(stageTimes.authenticode) &&
    stageTimes.authenticode < stageTimes.repositorySecurity
  ) {
    violations.push("$.stages.authenticode must not predate repository security evidence.");
  }
  if (
    Number.isFinite(stageTimes.authenticode) &&
    Number.isFinite(stageTimes.windowsPrinter) &&
    stageTimes.windowsPrinter < stageTimes.authenticode
  ) {
    violations.push("$.stages.windowsPrinter must not predate the signed release evidence.");
  }
  for (const prerequisite of [
    "providerPreview",
    "windowsPrinter",
    "repositorySecurity",
    "authenticode",
    "accessibilityLanguage",
  ]) {
    if (
      Number.isFinite(stageTimes[prerequisite]) &&
      Number.isFinite(stageTimes.incidentRollback) &&
      stageTimes.incidentRollback < stageTimes[prerequisite]
    ) {
      violations.push(`$.stages.incidentRollback must not predate ${prerequisite} evidence.`);
    }
  }
  if (
    Number.isFinite(generatedAt) &&
    Number.isFinite(stageTimes.institutionalApproval) &&
    generatedAt < stageTimes.institutionalApproval
  ) {
    violations.push("$.generatedAtUtc must not predate institutional approval completion.");
  }

  if (violations.length > 0) throw new ReadinessEvidencePolicyError(violations);

  return {
    schemaVersion: 1,
    product: dossier.product,
    releaseTag: release.tag,
    releaseCommit: release.commit,
    previewDeploymentId: release.preview.deploymentId,
    completedAtUtc: institutionalApproval.completedAtUtc,
  };
}
