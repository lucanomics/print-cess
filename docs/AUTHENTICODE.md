# Authenticode signing

An unsigned Windows build is not releasable. `.github/workflows/release-kiosk.yml` compiles and
tests the tagged source first, then hands the executable to a separate `windows-signing`
environment. Only that protected job can decode the PFX, sign `Print-cess Kiosk.exe`, verify the
Windows Authenticode policy with `signtool verify /pa /all /v`, remove symbols, and create the
release ZIP and checksum. The certificate file is created only in the runner temporary directory
and is removed in a `finally` block.

The workflow must be dispatched from the exact tag named by its input. It rejects a branch run,
ref/input mismatch, tag/`github.sha` mismatch, or tag commit that is not reachable from protected
`main`. GitHub additionally restricts the `windows-signing` and `github-release` environments to
`v*` tag refs. Active repository ruleset `19197379` prevents other write actors from creating,
moving, or deleting `v*` release tags; the current `lucanomics` user remains the sole bypass and
must be replaced by an approved institutional release role before Production.

## Protected environment contract

`windows-signing` exists with a `v*` tag-only deployment policy. Required-reviewer rules are not
available for this private personal repository under its current plan, so institutional ownership
or an eligible plan is still required before configuring signing material. Then configure:

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

Do not publish a stable GitHub Release until the signing environment, institutional tag-bypass
role, independent reviewer, certificate, timestamp service, target-device verification, and
revocation/rotation runbook are approved. No certificate or signed release was available during the
current macOS work.
