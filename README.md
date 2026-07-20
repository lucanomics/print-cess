# Print-cess by Paradiso

**Secure self-service document printing**

휴대전화에서 보내고 바로 출력하는 안전한 셀프 인쇄.

This private repository contains the mobile transfer service, browser simulators, shared
protocol, and Windows kiosk for a no-login, one-document, one-copy print flow. Development uses
encrypted local adapters; production integrations require separately approved Vercel and Upstash
resources.

The complete setup, security boundaries, test commands, Windows deployment procedure, and
remaining production blockers are documented in `docs/`. Never use real personal documents in
development, Preview, fixtures, or CI.

## Required tools

- Node.js 24.18.0 and pnpm 11.15.1 through Corepack;
- Git and GitHub CLI for the review workflow;
- .NET SDK 8 on Windows for WPF runtime validation and publishing;
- Playwright Chromium/WebKit binaries for end-to-end tests.

## Quick start

```bash
corepack enable
pnpm install --frozen-lockfile
cp .env.example apps/web/.env.local
pnpm dev
```

Open `http://localhost:3000/demo/kiosk`, scan the generated QR with a phone on the same reachable
development URL, or open its mobile link in another browser tab. Local mode stores ciphertext
only under an application-owned development directory.

The checked-in environment example is for local development. Hosted Preview/Production fails
closed unless exact HTTPS origins and the required Blob, Redis, QStash, kiosk-registration, and
administrator credentials are supplied. The Windows mock printer is available only with
`PRINT_CESS_ENVIRONMENT=Development` and a loopback server; it cannot be enabled for a Production
installation. See `docs/VERCEL_DEPLOYMENT.md` and `docs/WINDOWS_KIOSK_DEPLOYMENT.md` before changing
those defaults.

## Repository

```text
apps/web       Next.js mobile flow, simulators, and Route Handlers
apps/kiosk     .NET 8 WPF kiosk, core, infrastructure, and tests
packages       protocol, cryptography, translations, UI, and fixtures
docs           architecture, security, privacy, deployment, and operations
```

## Validation

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm build
pnpm test:e2e
```

Windows-only validation runs in GitHub Actions. A physical printer test is required before any
real deployment; a green CI build is not evidence that a printer model or driver is operational.

## Review, Preview, and Windows commands

Keep implementation work on `feature/initial-implementation`, push it, and open a Draft PR to
`main`. Do not merge until the documented Production gates are approved:

```bash
git push -u origin feature/initial-implementation
gh pr create --draft --base main --head feature/initial-implementation
gh pr checks --watch
```

Only after approved Preview credentials and isolated provider resources exist:

```bash
pnpm dlx vercel@56.3.2 link --project paradiso-print-cess
pnpm dlx vercel@56.3.2 env pull apps/web/.env.local --environment=preview
pnpm dlx vercel@56.3.2
```

On Windows PowerShell:

```powershell
dotnet restore apps/kiosk/Paradiso.PrintCess.sln --locked-mode
dotnet build apps/kiosk/Paradiso.PrintCess.sln -c Release --no-restore
dotnet test apps/kiosk/Paradiso.PrintCess.Tests/Paradiso.PrintCess.Tests.csproj -c Release --no-build
dotnet publish apps/kiosk/Paradiso.PrintCess.Kiosk/Paradiso.PrintCess.Kiosk.csproj -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true
```

Full procedures and evidence boundaries are in `docs/GITHUB_WORKFLOW.md`,
`docs/VERCEL_DEPLOYMENT.md`, and `docs/WINDOWS_KIOSK_DEPLOYMENT.md`.
