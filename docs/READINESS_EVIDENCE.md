# Release readiness evidence dossier

Production authorization requires one sanitized dossier that binds every external acceptance record
to the same Preview deployment, Git commit, signed kiosk executable, and Authenticode manifest.
Create a private, deliberately incomplete local template, then validate the completed export:

```sh
pnpm create:readiness-evidence-template --output artifacts/acceptance/readiness-dossier.json
pnpm validate:readiness-evidence --input <private-readiness-dossier.json>
```

The policy implementation is `scripts/acceptance/readiness-evidence-policy.mjs`. Its tests are safe,
synthetic contract examples; they are not acceptance evidence. Keep the real dossier and underlying
records in the institution's private system of record. Do not commit or upload them as unrestricted
GitHub Actions artifacts.

The template is created with owner-only file permissions and refuses to overwrite an existing file.
It contains `templateOnly: true`, pending statuses, and false result flags, so it must fail validation.
Set `templateOnly: false` only in the final sanitized export after the private system of record has
supplied every required decision and immutable record digest.

## What the validator proves

The validator rejects a dossier unless it records all of the following:

- the exact `vX.Y.Z` or prerelease tag, full Git commit, protocol version, signing-manifest SHA-256,
  executable SHA-256, approved signer thumbprint, and non-Production Preview deployment;
- isolated Blob, Redis, and QStash resources plus passed provider race, operation-scope, expiry,
  cleanup, signed-delivery, and Production-isolation checks;
- the target Windows/printer collector digest, exact configuration digests, every physical matrix
  row, synthetic-output destruction, uncertain-job no-retry behavior, and five required witness
  roles;
- strict required repository checks, an independent reviewer, native CodeQL for JavaScript/TypeScript
  and C#, native secret scanning and push protection, plus helper scanning;
- exact Authenticode identity, SHA-256 timestamp, certificate custody approval, malware scan, and
  independent target-device re-verification;
- the five required device classes, two approved mobile carriers, twelve accessibility checks, and
  distinct qualified native reviewers for all eight locales;
- an authorized Preview-only drill with the ten required roles, seven exercise steps, bounded RTO/RPO,
  credential replacement, cleanup recovery, signed rollback, no uncertain reprint, and owned gaps;
- nine institutional approval decisions, review dates, immutable record hashes, launch window, named
  rollback authority, and a final go/no-go after all prerequisite evidence.

It also rejects release/deployment identity drift, invalid sequencing, Production contact, real
personal data, missing witnesses, reused language reviewers, an observer who also commands or records
the drill, and fields intended to carry names, live QR fragments, signed URLs, token values, or secret
values.

This is a completeness and cross-record consistency check. It does not authenticate an approver,
prove that a physical observation occurred, verify a private record's signature, or grant launch
authority. Those facts remain the responsibility of the institution's approval system and named
owners.

## Record construction

1. Freeze the Preview deployment ID and commit. Confirm the deployment is not Production and that
   Blob, Redis, and QStash are isolated Preview resources.
2. Run the credential-backed provider suite and retain its sanitized workflow/provider audit record.
3. Protect the repository, enable native CodeQL and secret protection, create the approved signed
   prerelease, and independently record the Authenticode manifest digest and certificate inventory
   decision.
4. Run the target Windows collector and physical matrix. Hash the sanitized collector output,
   device configuration record, printer configuration record, witness attestations, and retention
   decision separately.
5. Run device/accessibility tests and in-context language review against the frozen commit and
   Preview deployment. Store reviewer identities privately; use opaque reviewer and attestation IDs
   in the dossier.
6. Run the authorized synthetic incident/rollback drill. Store contact paths and the detailed
   timeline privately; expose only opaque role-owner IDs, outcome flags, objective measurements, and
   evidence hashes in the dossier.
7. Record each institutional decision with an opaque approver reference, decision record ID,
   decision/review timestamps, conditions, scope commit, and attestation SHA-256. Record final
   go/no-go last.
8. Run the validator on a trusted workstation. Preserve the validator version/commit and dossier
   digest with the final decision.

Every `evidenceRefs` entry contains only an opaque uppercase record ID, a lowercase 64-hex SHA-256,
and `sanitized: true`. A hash does not make unsafe evidence safe: review/redact first, then hash the
approved sanitized representation. Any material provider, protocol, crypto, executable, Windows,
printer/driver/firmware, kiosk policy, visible copy, or audio change invalidates the affected stages
and the final approval.
