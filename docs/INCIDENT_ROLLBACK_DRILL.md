# Incident response and rollback drill

Run this as a synthetic Preview/tabletop exercise first. Do not touch Production, revoke real
credentials, interrupt a site, or roll back an approved deployment without the incident commander
and system owners authorizing the drill window. A green CI run is not rollback evidence.

## Roles and prerequisites

Assign an incident commander, application/security lead, Vercel owner, Upstash owner, Windows
endpoint owner, printer/site operator, privacy officer, communications owner, evidence recorder,
and independent observer. Record contact paths and substitutes outside the repository.

Before starting, capture the approved commit/tag, Vercel deployment IDs, protocol version, provider
resource IDs/regions, kiosk executable hash, signer thumbprint, Windows image, printer/driver,
credential versions, active-session count, known-good package/deployment, monitoring baseline,
recovery objectives, and explicit abort criteria. Use synthetic documents and a Preview resource
set that cannot reach Production.

## Exercise sequence

1. **Declare and contain.** Simulate a leaked signed URL or provider token. Stop new sessions,
   preserve non-sensitive evidence, identify scope without copying bearer values into tickets, and
   exercise the approved credential rotation order. Confirm old credentials fail and new sessions
   use only the replacements.
2. **Provider/cleanup outage.** Block or simulate QStash/Blob deletion, allow an orphan record to
   become due, restore service, run the bounded authenticated sweep, and prove idempotent deletion
   without exposing a path or token in logs.
3. **Web rollback.** Mark active version-1 sessions unavailable, wait for or force the three-minute
   expiry and cleanup, then roll Preview back to the recorded compatible deployment. Never mix an
   incompatible protocol with active sessions. Re-run synthetic create/claim/upload/consume/cleanup.
4. **Kiosk rollback.** Stop the kiosk, inspect the recovery journal and spooler, install the last
   approved signed package, verify Authenticode/hash/configuration, and start a fresh session. Never
   automatically replay a submission whose spool status is uncertain.
5. **Printer ambiguity.** Simulate power/network loss immediately around submission. Exercise the
   authenticated P-04 decision with the physical queue and output witness; prove no silent retry or
   second copy.
6. **Privacy escalation.** Simulate discovery of a document identifier in logs. Quarantine access,
   establish provider/log/artifact scope, invoke notification decision owners, remove unsafe
   telemetry, rotate affected credentials, and record a deletion/retention limitation accurately.
7. **Restore and monitor.** Re-enable sessions only after smoke tests, deletion checks, metrics, site
   readiness, and incident-commander approval. Observe for the agreed window and close temporary
   access.

## Pass criteria and evidence

The drill passes only if every step has timestamped owner actions; no real personal data is used;
no secret or full signed URL reaches logs/tickets; affected sessions and orphans reach a known
terminal/deleted state; rollback artifacts retain valid signatures and hashes; no uncertain job is
reprinted; communications and escalation targets respond within approved objectives; and all gaps
have owners and due dates. Attach sanitized provider audit records, GitHub/Vercel run identifiers,
Windows/printer acceptance output, spool observations, timeline, decisions, and postmortem actions.

Repeat before launch, after protocol/crypto/provider/Windows/printer changes, and at the institution's
approved cadence. A Production rollback remains prohibited until institutional authorization and a
controlled change window exist.

After the exercise, export only opaque role-owner IDs, timestamps, outcome flags, RTO/RPO values,
and hashes of sanitized records into the `incidentRollback` stage described in
`READINESS_EVIDENCE.md`. The validator requires role separation for the independent observer, all
seven steps, and final approval after the drill. It does not prove that the exercise occurred.
