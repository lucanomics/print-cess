# Authenticode signing

An unsigned Windows build is not releasable. `.github/workflows/release-kiosk.yml` compiles and
tests the tagged source first, then hands the executable to a separate `windows-signing`
environment. Only that protected job can decode the PFX, sign `Print-cess Kiosk.exe`, verify the
Windows Authenticode policy with `signtool verify /pa /all /v`, remove symbols, and create the
release ZIP and checksum. The certificate file is created only in the runner temporary directory
and is removed in a `finally` block.

## Protected environment contract

Create `windows-signing` with required institutional reviewers and no branch other than protected
tags. Configure:

- secret `WINDOWS_SIGNING_CERT_BASE64`: base64 of the approved code-signing PFX;
- secret `WINDOWS_SIGNING_CERT_PASSWORD`: independent PFX password;
- variable `AUTHENTICODE_EXPECTED_SUBJECT`: approved signer subject text;
- variable `AUTHENTICODE_TIMESTAMP_URL`: approved RFC 3161 timestamp endpoint.

The certificate must permit code signing, have an approved private-key custody and rotation owner,
and build a trusted chain on the target Windows image. Prefer a non-exportable HSM or managed
signing service for Production; the PFX workflow is a minimum portable implementation and requires
formal exception approval if used. Do not use a self-signed certificate for acceptance.

## Acceptance evidence

For every release candidate, retain the protected workflow run, signed ZIP checksum, tag/commit,
`authenticode-verification.txt`, certificate subject/thumbprint/validity, timestamp result, and the
target-device output from `scripts/windows/Invoke-PrintCessAcceptance.ps1`. Verify the signature
again after download and before installation. A valid signature does not prove institutional
approval, printer compatibility, or safe deployment.

Do not publish a stable GitHub Release until the signing environment, tag restriction, reviewer,
certificate, timestamp service, target-device verification, and revocation/rotation runbook are
approved. No certificate or signed release was available during the current macOS work.
