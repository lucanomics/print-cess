# Institutional approval record

Production remains disabled until the institution's private approval system records all gates below
against the exact release commit, signed kiosk hash, Preview deployment, provider resources, Windows
image, and printer/driver. Repository checkboxes are a routing aid, not authorization.

## Required decisions

| Gate                    | Accountable approver                                | Minimum evidence                                                                                          |
| ----------------------- | --------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Information security    | Institutional security authority                    | Architecture/threat review, provider test, repo controls, endpoint hardening, residual-risk acceptance    |
| Privacy/legal           | Privacy officer and counsel                         | Processing roles/basis/notices, cross-border/provider terms, logs/backups, output handling, breach path   |
| Procurement/provider    | Contract and service owners                         | Vercel/Upstash contracts, DPA/subprocessors, regions, support access, availability, exit/erasure limits   |
| Windows endpoint        | Endpoint authority                                  | Signed package, image/Assigned Access, allow-lists, patching, disk/spool policy, install/update/rollback  |
| Printer/site operations | Site and printer owners                             | Exact model/driver/firmware acceptance, supplies, physical layout/output handling, error ownership        |
| Accessibility/content   | Accessibility owner and thirteen language reviewers | Device matrix, assistive-technology evidence, and native-language sign-off                                |
| Incident readiness      | Incident commander and privacy/security owners      | Synthetic incident/rollback drill, contact tree, recovery objectives, rotation and notification decisions |
| Brand/service ownership | Product and institutional communications            | Naming/trademark, no official-service confusion, approved public text and support boundary                |
| Final go/no-go          | Named executive/service owner                       | All blocker evidence linked, dated residual-risk acceptance, launch window and rollback authority         |

## Sequencing

Close Preview provider acceptance first, then target Windows/printer acceptance, repository security
and Authenticode, device/accessibility/language review, and the incident/rollback drill. Reconcile all
evidence in `PRODUCTION_BLOCKERS.md`; obtain risk-owner decisions; then request final go/no-go. A
change after approval reopens every materially affected gate.

The approver records must include decision, scope, conditions, expiry/review date, evidence links,
and named owner. Never commit signatures, personal contact details, provider contracts, secrets, or
sensitive infrastructure diagrams to this repository. No institutional approval has been granted by
the implementation work itself.

Before final go/no-go, assemble the sanitized private dossier defined in `READINESS_EVIDENCE.md` and
run `pnpm validate:readiness-evidence --input <private-readiness-dossier.json>`. A passing result is
required completeness evidence, but is not approval. Preserve the dossier hash, validator commit,
and private approval-system attestations with the final decision.
