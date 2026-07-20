# GitHub workflow

## Repository and branch strategy

The repository is private at `lucanomics/paradiso-print-cess`. `main` is the releasable integration
branch. Implementation occurs on short-lived branches such as `feature/initial-implementation` and
enters `main` only through a pull request.

Use Conventional Commits:

- `feat(scope): ...` for behavior;
- `fix(scope): ...` for defects;
- `test(scope): ...` for test-only work;
- `docs(scope): ...` for documentation;
- `chore(scope): ...` for tooling/dependencies.

Open the initial change as a Draft PR. Mark it ready only when test evidence and blocker status are
accurate. This task does not authorize merging `main`.

## Required review

`CODEOWNERS` assigns the repository owner globally and calls out protocol, cryptography, API,
kiosk infrastructure, security documentation, and workflows. Security-critical changes need an
explicit owner review even if generated code or dependency automation created the PR.

PRs must:

- use only synthetic fixtures and sanitized screenshots;
- state whether protocol, crypto, privacy, cleanup, printing, or provider configuration changed;
- distinguish macOS/local, hosted Windows, Preview, and physical-printer evidence;
- include a migration/version decision for protocol-breaking work;
- confirm that no Production deployment, Release, or `main` merge occurred unless separately
  authorized.

## Actions

### `ci.yml`

On pull requests and pushes to `main`:

- **Web** on Ubuntu with Node.js 24.18.0 and pnpm 11.15.1: frozen install, format check, lint,
  typecheck, unit tests, integration tests, production build, Playwright Chromium E2E, and safe
  report/coverage artifact upload. Automated Playwright screenshots and traces are disabled because
  QR images and network bodies can contain short-lived credentials.
- **Windows kiosk** on `windows-latest` with .NET 8: restore, Release build, xUnit/TRX tests, a
  self-contained `win-x64` publish smoke test, a synthetic-only TRX artifact, and the smoke binary.

The Web workflow uploads only coverage and the HTML Playwright report for three days; raw
`test-results`, screenshots, and traces are excluded. Windows TRX and publish-smoke artifacts are
retained for seven days. Artifact names contain only run identifiers. If a failure output includes
a URL, token, fragment, filename, document data, or provider body, cancel sharing, delete the
artifact, rotate any affected credential, and treat the run as a security/privacy incident.

External service credentials are not supplied. Tests run in local/mock mode. A successful Windows
job proves WPF compilation and test behavior on a hosted VM; it does not prove the real printer,
driver, spool retention, kiosk lockdown, touch/audio, or physical output.

### `security.yml`

Runs on relevant pushes/PRs, manual dispatch, and weekly schedule:

- CodeQL JavaScript/TypeScript analysis on Ubuntu when repository variable `ENABLE_CODEQL=true`;
- CodeQL C# analysis with a manual WPF build on Windows under the same gate;
- production pnpm audit and NuGet transitive-vulnerability report;
- full-history Gitleaks helper scan.

The GitHub API reported on 2026-07-20 that code scanning is not enabled for this private
repository, so both CodeQL jobs are explicitly skipped until an administrator enables the feature
and sets `ENABLE_CODEQL=true`. Do not set that variable merely to make the jobs appear active;
first confirm licensing and a successful manual run. The Gitleaks helper complements, but does not
enable, GitHub native secret scanning or push protection. Gitleaks Action licensing must be checked
if ownership moves from a personal account to an organization.

### `release-kiosk.yml`

This is manual-only and tag-based. The operator supplies an existing `vX.Y.Z` stable tag or
`vX.Y.Z-rc.N` prerelease tag. It restores, builds, tests, publishes self-contained `win-x64`,
creates a ZIP and SHA-256 checksum, and uploads a workflow artifact.

The separate GitHub Release job runs only when the operator explicitly sets `publish_release`, an
administrator has set repository variable `ENABLE_GITHUB_RELEASES=true`, and the job passes the
protected `github-release` environment. Stable and prerelease inputs are validated against tag
syntax. Keep the variable absent until the environment is configured; otherwise GitHub can create
a referenced environment without the intended protection. The workflow exists for future
authorized use; it was not run and no GitHub Release is published by this task.

## Branch protection / ruleset

An administrator must configure a ruleset for `main`:

1. Require a pull request, at least one approval, CODEOWNERS review, and resolution of
   conversations.
2. Dismiss stale approvals when security-critical files change.
3. Require up-to-date branches and checks **CI / Web** and **CI / Windows kiosk**. Add CodeQL and
   dependency/secret checks after their first successful run and licensing is confirmed.
4. Block force pushes, branch deletion, and ordinary administrator bypass.
5. Require linear history and signed commits if institutional signing infrastructure exists.
6. Restrict creation of `v*` tags to release maintainers.

Workflow files cannot enforce repository settings by themselves. Ruleset/secret-scanning status is
a Production blocker until an administrator captures evidence. A read-only GitHub API check on
2026-07-20 reported `main` unprotected and zero configured environments.

## Protected environments

Create before enabling any corresponding repository circuit breaker:

- `github-release`: required reviewer, tag restriction, no general secrets; only then set
  `ENABLE_GITHUB_RELEASES=true`;
- `vercel-preview`: Preview-only credentials/resources, synthetic data only;
- `vercel-production`: multiple required reviewers, Production credentials, deployment branch
  `main` only.

Never expose credentials to untrusted fork pull requests. Workflows use least-privilege
`permissions` and grant `contents: write` only to the explicit Release job.

## Secret management

No real secret belongs in Git, fixtures, workflow YAML, artifacts, PR text, or screenshots. Store
GitHub Release signing credentials and Vercel/Upstash values in their protected environment or
provider secret store. Rotate any value that reaches logs or history. Enable native secret
scanning and push protection when licensing allows.

Required Production secret inventory and owners must include Blob/OIDC, Redis, QStash current/next
keys, kiosk registration, administrator authentication, code-signing certificate access, and
deployment credentials. Release artifacts must not contain `.env` files.

## Dependency updates

Dependabot checks npm/pnpm, NuGet, and GitHub Actions weekly. Review lockfile changes, release notes,
licenses, provenance, parser/renderer attack surface, and test evidence. Do not auto-merge
cryptography, document parsing, printing, or workflow changes.

## Version and release policy

Use SemVer while the product is pre-1.0. A protocol-incompatible change requires a new explicit
protocol version and cannot silently reuse active sessions. Tag examples:

- `v0.2.0-rc.1`: prerelease for controlled Windows acceptance;
- `v0.2.0`: approved stable artifact.

Publishing a stable tag is not deployment approval. Before any Release, require Windows CI, exact
printer/driver acceptance, Authenticode signing, checksum verification, security/privacy approval,
and rollback evidence. Before any Production web deployment, close `PRODUCTION_BLOCKERS.md`.
