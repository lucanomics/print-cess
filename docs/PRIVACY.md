# Privacy

## Principle

Print-cess by Paradiso is designed for transient document transfer, not document storage,
identification, account creation, analytics, or case management. Data minimization does not remove
the need for institutional privacy and information-security approval before deployment.

## Information the application does not request or intentionally collect

- name, email, phone number, nationality, passport or foreign-resident number;
- airline, flight, booking/reservation number, or ticket fields;
- account credentials or sign-in to KakaoTalk, email, cloud storage, or any desktop service;
- original filename or free-text input;
- document plaintext in Vercel, Blob, Redis, QStash, application logs, or metrics;
- raw upload/kiosk token, ECDH private key, AES key, URL fragment, or complete signed URL;
- deliberate long-term IP/session analytics or cross-session user identifier.

The service does not search, buy, issue, or retrieve a document. A visitor without a phone, mobile
data, or the file must contact the reservation holder, airline, or travel agency.

## Information processed transiently

| Location                       | Transient data                                                                                                                          | Intended lifetime                                                                                                  |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Visitor phone                  | Selected plaintext, preview, ephemeral key, upload token, kiosk fingerprint, ciphertext buffer                                          | Active flow; browser/OS behavior can retain page state beyond application control                                  |
| Route Handler                  | Session ID, status request, token in authorization header, small metadata, signed URL during response construction                      | Request lifetime; only redacted operational event afterward                                                        |
| Upstash Redis                  | Protocol/status/revision, public key/fingerprint, credential/idempotency hashes, consume lease, random Blob path, ETag/size, timestamps | Active record: three minutes plus cleanup buffer; terminal receipt: 15 seconds                                     |
| Redis orphan ledger            | Pseudonymous session ID, random pathname, ETag, creation/due time, due-time index                                                       | Until conditional Blob delete succeeds; provider outage can extend this and requires a bounded sweep               |
| Vercel Private Blob            | Binary encrypted envelope at a random pathname                                                                                          | Delete immediately on terminal outcome; delayed cleanup target at no more than three minutes after authorization   |
| QStash                         | Cleanup destination/timing and pseudonymous cleanup reference                                                                           | Provider delivery/retry retention, subject to approved provider policy                                             |
| Windows kiosk                  | Session token/key, ciphertext, decrypted bytes, validation/render buffers                                                               | Active session; best-effort clearing on terminal outcome or restart                                                |
| Kiosk print journal            | SHA-256 of the random session ID, submission state, safe code, and timestamp                                                            | Resolved records prune after 24 hours; ambiguous records remain until authenticated acknowledgement, then 24 hours |
| Windows spooler/driver/printer | Rendered page/job metadata and physical output                                                                                          | OS, driver, firmware, and policy dependent; must be validated before deployment                                    |

“Deleted” in the UI means the application has completed or accepted its explicit deletion workflow.
It is not a promise of immediate physical erasure from provider backups, mobile browser caches,
RAM, page files, crash dumps, printer storage, or every infrastructure access log.

## Deletion triggers and backstops

Explicit cleanup runs after successful print, print failure, cancellation, QR/work expiry,
interrupted upload, decryption/authentication failure, file rejection, app restart, or administrative
session discard. Cleanup is idempotent and deletes the expected Blob before the session record.

Delayed QStash cleanup, Redis TTL, kiosk startup cleanup, and a production-required orphan-object
sweep are independent backstops. Redis expiry alone cannot delete a Blob and therefore is not the
sole retention control. The adapters persist a pseudonymous pathname/ETag orphan record and
due-time index across session loss or deletion failure, then remove both after conditional Blob
delete. Local failure/race tests exist; credential-backed retention and recovery behavior remains a
Production gate.

The kiosk's durable submission journal intentionally survives restarts to block duplicate prints.
It stores a one-way hash of the random session ID rather than the document or filename. Completed,
rejected-before-submission, and administrator-resolved records are pruned after 24 hours;
unresolved/uncertain/recovery-blocked records are never automatically pruned. An authenticated
administrator can acknowledge a recovery-blocked record after following the P-04 procedure, which
marks it resolved but still never permits replay. The 24-hour period and acknowledgement procedure
remain subject to institutional privacy/operations approval.

## Provider-visible information

Even though providers cannot normally decrypt the object, Vercel, Blob, Upstash Redis, QStash,
network operators, and their subprocessors may process source IP, user agent, timestamps, request
route, random object/session reference, ciphertext size, status/latency, and infrastructure logs.
Their data location, access, backup, support, subprocessor, and retention practices are outside
complete application control.

Before use at the Jeju Immigration Office, the responsible institution must review and approve:

- the legal basis, notices, controller/processor roles, and Korean privacy-law obligations;
- Vercel and Upstash contracts/DPA, regions, subprocessors, support access, backups, and log
  retention;
- cross-border transfers and whether alternative institution-approved hosting is required;
- Windows crash dump/page file/spool policy and printer firmware/job retention;
- incident response, data-subject inquiry handling, and physical abandoned-print disposal.

This repository is not itself an institutional privacy notice.

## Logs and metrics

Application logs use allow-listed event codes and never contain filename, content, person/contact/
identity/reservation fields, token, key, fragment, or full signed URL. IP is not deliberately copied
into application logs. Infrastructure logs may still contain network metadata.

Metrics are off by default. If formally approved, they are limited to aggregate success, file
rejection, upload failure, printer error, and processing duration. Do not attach a durable session
identifier or retain raw events long enough to reconstruct an individual's visit.

## Development, Preview, and support

Use only fixtures visibly marked synthetic and invalid. Do not upload a real travel document,
passport page, reservation, immigration document, or personal screenshot to local development,
Preview, CI, an issue, a PR, a log, or a support ticket. Screenshots must be checked for QR
fragments and signed URLs before sharing.

Native-speaker review and privacy review must also examine translations: a technically accurate
English disclosure can become misleading when translated.

## CI evidence

Automated Playwright runs disable screenshots and traces because QR pixels and network bodies can
contain short-lived bearer credentials. CI uploads only coverage and an HTML/assertion report for
three days. Windows CI uses synthetic inputs and retains TRX plus a publish-smoke binary for seven
days; it does not upload mock-print artifacts or document buffers. Treat any unexpected URL,
fragment, token, filename, document data, or provider response in evidence as an incident: stop
sharing, delete the artifact, rotate affected credentials, and follow the approved response path.
