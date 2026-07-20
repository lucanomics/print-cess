# Operations runbook

## Purpose

This runbook gives on-site staff the smallest safe action set. It does not authorize staff to take
a visitor's phone, search files, sign in to KakaoTalk/email/cloud storage, type a password, or copy a
document to the public desktop. Normal use requires no staff action.

This is the required operating procedure for an approved deployment, not evidence that the initial
WPF implementation is deployable. Its authenticated diagnostics screen implements S-01 session
discard, exact allow-listed installed-printer selection, configured-printer status, synthetic
printing, restart, audio test, redacted observations, explicit server/Redis/Blob/QStash status, and
the server's capped S-02 orphan sweep. Server and Redis `ready` indicators are live checks;
external Blob/QStash `configured-unverified` indicators are configuration evidence only. Keep the
service unavailable until live provider and target-Windows acceptance passes.

Visitor-facing errors show one code and state that the uploaded object was deleted. Internal
details, session IDs, tokens, filenames, signed URLs, and provider responses are never written down
or photographed.

## First rule: prevent duplicate printing

If the kiosk says **print status unknown** or code **P-04**, do not retry, restart into the same
session, resume the queue, or tell the visitor to upload again. First take the kiosk out of service
and have an authorized administrator inspect the physical output and named printer queue. A new
session is allowed only after the old job is conclusively printed/removed or the incident owner
accepts the duplication risk.

For all other failed sessions, the encrypted object is not recoverable. After the fault is cleared,
the visitor starts again with the new QR on their own phone.

## Error codes

| Code     | Meaning                                        | Staff action                                                                                                                                                                            | Return to service when                                                                     |
| -------- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| **P-01** | Out of paper                                   | Take kiosk out of service. Refill the approved A4 tray; check tray guides. Do not open/retry the old session.                                                                           | Printer reports Ready and one synthetic test page succeeds                                 |
| **P-02** | Printer offline/disconnected                   | Check printer power, cable/network link, and the approved queue. Do not select a different/virtual printer.                                                                             | Exact configured queue reports Ready and synthetic test succeeds                           |
| **P-03** | Printer paused/jam/error                       | Clear the physical jam/error per printer instructions; authorized admin unpauses the exact queue.                                                                                       | Queue is empty/understood, printer is Ready, synthetic test succeeds                       |
| **P-04** | Submission status unknown                      | Stop service. Do not retry. Inspect output tray and spool queue; escalate to the incident owner.                                                                                        | Incident owner records a no-duplicate decision and resets service                          |
| **P-05** | Fixed settings unsupported                     | Stop service; record printer/driver version; escalate to device support. Do not substitute settings.                                                                                    | Approved driver/model passes A4/simplex/mono/one-copy test                                 |
| **F-01** | Document could not be safely rendered          | Do not print or retry the old session. Confirm cleanup, then allow a fresh QR. If synthetic supported files repeat the error, stop service and escalate.                                | Cleanup is confirmed and either a new session is safe or support clears the renderer fault |
| **N-01** | Desktop wired internet unavailable             | Check Ethernet link and the institution's network status. Do not connect the kiosk to a visitor hotspot.                                                                                | Server health check succeeds over approved wired network                                   |
| **N-02** | Service/provider unavailable                   | Confirm device time, approved service-status channel, and firewall status; leave service unavailable.                                                                                   | Health checks recover and cleanup backlog is within limit                                  |
| **C-01** | Device clock invalid                           | Keep service stopped; authorized admin restores institutional time synchronization.                                                                                                     | Time/TLS checks and a synthetic session succeed                                            |
| **A-01** | Kiosk app stopped/unresponsive                 | Use the administrator maintenance path to restart the app once. Do not restore an old session.                                                                                          | Startup cleanup completes and a fresh QR appears                                           |
| **A-02** | Repeated app crash                             | Stop service, preserve only redacted Windows/application diagnostics, and escalate.                                                                                                     | Signed known-good version or approved fix passes acceptance                                |
| **S-01** | Active session must be discarded               | Authenticate to the hidden admin screen and choose session discard. Never inspect/download the file.                                                                                    | Cleanup reports success/pending and a fresh QR appears                                     |
| **S-02** | Cleanup pending/failed                         | Keep ordinary printing disabled and escalate to the service owner. An authorized administrator may run the WPF bounded sweep once; do not repeat it blindly or browse provider objects. | Sweep reports no failure and approved provider evidence shows no overdue orphan references |
| **S-03** | Suspected credential/data exposure             | Disconnect service, do not copy evidence containing personal data, contact security/privacy incident owner.                                                                             | Credentials are rotated, scope assessed, cleanup/audit complete                            |
| **U-01** | Visitor has no phone, mobile data, or document | Explain that this service cannot find, buy, or issue the document.                                                                                                                      | Direct the visitor to the reservation holder, airline, or travel agency                    |

Do not use “ask an employee to find the file” as the default response. Staff assistance is limited
to the kiosk/printer/network service, not the visitor's accounts or phone contents.

## Start-of-day check

1. Inspect the printer/output area for abandoned paper and follow the approved confidential disposal
   process.
2. Confirm the kiosk displays the full Print-cess by Paradiso name, a fresh QR, supported formats,
   mobile-data guidance, and a changing remaining time.
3. Confirm the exact configured printer is Ready, has A4 paper, and has no unexplained queued jobs.
4. Confirm wired network, device time, server, Blob, Redis, QStash, and cleanup-lag indicators.
5. Use the built-in synthetic test print. Never use a real visitor document.
6. Confirm the completion screen resets after 15 seconds and no prior QR/status remains.

## End-of-day check

1. Confirm no active session and no unexplained print job.
2. Run the redacted health/cleanup check. Do not browse Blob objects.
3. Remove abandoned paper using the approved confidential disposal process.
4. Leave the kiosk in the institution's approved powered/locked state.

## Safe restart

1. If P-04 is visible, follow P-04 instead; do not restart first.
2. Use the hidden administrator path and authenticate. Public UI must not link to it.
3. Discard the active session if present and request cleanup.
4. Restart the app. Shell Launcher/watchdog may also restart it.
5. Confirm startup cleanup and a fresh key/QR. Never resume `consumed`, `validating`, or
   `printing`.
6. Run one synthetic session before returning the kiosk to service.

## Administrator session reset

Session reset is destructive and intentionally cannot recover a document. It seals/cancels the
session, deletes the expected Blob, clears kiosk key/buffers and UI, and creates a new key/session.
If delete is pending, code S-02 remains visible only in authenticated diagnostics. The server has a
bounded, administrator-authenticated orphan sweep exposed as a maximum-25-record WPF action. Run
it once, record only aggregate counts, and escalate on failed records. Provider behavior remains
unverified until approved Preview/Production acceptance; do not expose a signed URL or object
browser.

## Service-disable decision

Keep the kiosk unavailable when:

- printer submission is ambiguous;
- cleanup is overdue beyond the approved threshold;
- the configured printer/settings cannot be enforced;
- the app repeatedly crashes or shows a prior-user state;
- device time/TLS, wired network, server, or required provider is unhealthy;
- Production mode reports mock print engine;
- the kiosk environment marker is not `Production`, or its exact server/Blob host allow-list does
  not match the approved Production resources;
- a credential, signed URL, document, or personal identifier may have entered logs/artifacts;
- Windows/runtime/driver security support has expired.

Use the neutral kiosk message:

> Printing service is temporarily unavailable. Error code: [code]. Your uploaded file has been
> deleted.

Do not show stack traces or provider text.

## Incident record

The allowed record is: rounded time, kiosk asset ID, app/protocol version, error code, printer model/
driver version when relevant, aggregate outcome, staff action, and escalation owner. Do not record
session ID, IP, QR, token, URL, filename, document description, name, contact, passport, reservation,
or travel details. Sanitize screenshots or avoid them.

Security/privacy incidents follow institutional procedure. Rotate exposed credentials and treat a
potential plaintext/spool/physical-output disclosure as a privacy event even if application logs
are clean.
