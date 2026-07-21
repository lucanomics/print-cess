# Windows and physical-printer acceptance

Hosted `windows-latest` CI proves compilation, tests, and a self-contained publish only. It cannot
approve the institution's Windows image, exact printer/driver, spooler retention, physical output,
kiosk lockdown, audio, display, or recovery behavior. This gate must run on the target desktop at
Jeju Immigration Office with synthetic documents only.

## Evidence collector

On the target device, after installing the signed release candidate and setting machine-level
configuration, run an elevated PowerShell session:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
./scripts/windows/Invoke-PrintCessAcceptance.ps1 `
  -ApplicationPath "C:\Program Files\Paradiso\Print-cess Kiosk\Print-cess Kiosk.exe" `
  -PrinterName "<approved exact queue name>" `
  -SigningManifestPath ".\authenticode-manifest.json" `
  -ExpectedSigningManifestSha256 "<64-hex digest recorded in the approval system>" `
  -ExpectedReleaseTag "<approved vX.Y.Z or prerelease tag>" `
  -ExpectedCommitSha "<full approved Git commit>" `
  -ExpectedSignerThumbprint "<40-hex thumbprint from certificate inventory>"
```

Obtain the manifest and its sidecar from the protected signing run, then record the manifest digest,
release tag, commit, and signer thumbprint in the institution's approval system before moving files
to the target. The thumbprint must come from the approved certificate inventory, not solely from
the manifest under test. The collector rejects a changed manifest, substituted release, mismatched
product version or executable hash, different signer, missing/different timestamp, or invalid
Authenticode result.

The JSON records that release identity plus the executable hash/version/signature, Windows build,
printer/driver/port and fixed print defaults. Secrets are represented only by presence/shape
booleans. Review the file for site infrastructure details before attaching it to a private approval
ticket. The script does not submit a print job and cannot close the physical tests below.

## Physical acceptance matrix

Record device asset ID, Windows image version, printer model/serial, exact driver/package version,
firmware, port type, paper, toner, network path, app tag/commit/hash, tester, witness, UTC time, and
result for each row.

| Test                                              | Required observation            | Pass condition                                                           |
| ------------------------------------------------- | ------------------------------- | ------------------------------------------------------------------------ |
| PDF 1 page / PDF 2 pages / JPG / PNG              | Physical A4 output              | One copy, all pages, simplex, grayscale, fit-to-page, legible, no dialog |
| Two phones race one QR                            | Claim/status and paper          | One phone wins; loser is blocked; exactly one print                      |
| Repeat approve, refresh, back, app restart        | Queue and paper count           | No duplicate submission or automatic reprint                             |
| Offline, out of paper, paused                     | Kiosk error and queue           | Safe P-code, ciphertext cleanup, no uncertain auto-retry                 |
| Disconnect desktop network during upload/download | Both UIs and cleanup            | Bounded failure, no plaintext, orphan later removed                      |
| Power loss before and after spool submission      | Journal, queue, paper           | No automatic replay; ambiguous job requires authenticated P-04 decision  |
| Wrong printer or changed driver defaults          | Startup/admin diagnostics       | Service stays suspended or rejects policy conflict                       |
| Completed user then next user                     | Screen, memory/temp dirs, queue | New QR after 15 seconds; no prior preview/session/plaintext visible      |
| Ten sequential synthetic sessions                 | Queue/paper/session state       | Ten documents, no missing/duplicate jobs, bounded processing time        |
| Assigned Access, reboot, update, rollback         | Desktop controls and startup    | Kiosk recovers without exposing shell or reprinting an old job           |

Inspect the Windows spool directory and vendor tooling with the institution's endpoint team. The
application cannot promise immediate spool-file erasure; approve the OS/driver retention and disk
encryption policy separately. Destroy all physical synthetic output after evidence review.

Acceptance requires application/security engineering, Windows endpoint administration, printer
operations, site operations, and privacy/security witnesses to sign the dated matrix. Any change to
the executable, Windows image, printer/driver/firmware, print path, provider endpoints, or kiosk
policy invalidates the affected rows.

Hash the approved sanitized collector output, device configuration, printer configuration, physical
matrix, retention decision, and witness attestations. Reference those private records from the
`windowsPrinter` stage in `READINESS_EVIDENCE.md`; its validator also requires the collector's release
tag, commit, manifest digest, executable digest, and signer thumbprint to match the final dossier.
