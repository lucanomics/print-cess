## Outcome

Describe the user-visible or operational outcome.

## Scope

- Areas changed:
- Protocol/crypto/file-format change: yes / no
- Privacy/security/cleanup change: yes / no
- Windows printing/kiosk policy change: yes / no

## Evidence

- [ ] `pnpm format:check`
- [ ] `pnpm lint`
- [ ] `pnpm typecheck`
- [ ] `pnpm test`
- [ ] `pnpm test:integration`
- [ ] `pnpm build`
- [ ] `pnpm test:e2e`
- [ ] GitHub Windows build/test/publish
- [ ] Credential-backed Preview integration, or explicitly not run
- [ ] Exact physical printer test, or explicitly not run

Link sanitized logs/artifacts and state the actual OS/toolchain. A hosted Windows runner is not
physical-printer evidence.

## Security and privacy

- [ ] Only obviously synthetic data is present.
- [ ] No filename, document content, person/contact/identity/reservation data, token, fragment,
      signed URL, private key, secret, or provider body appears in code, fixtures, logs, screenshots, or
      artifacts.
- [ ] Session state/consume-once/cleanup and invalid-transition behavior were reviewed if touched.
- [ ] Threat model, privacy, blockers, tests, and runbook were updated where behavior changed.
- [ ] New/updated dependencies were reviewed for provenance, maintenance, vulnerabilities, and
      license.

## UX and brand

- [ ] Full Print-cess by Paradiso identity and government-neutral tone are preserved.
- [ ] One-action error guidance does not default to staff handling a visitor's phone/account.
- [ ] Accessibility, reduced motion, and translations were considered.
- [ ] Screenshots contain synthetic data and no live QR/URL credentials.

## Release and deployment

- [ ] This PR does not merge `main` by itself.
- [ ] No GitHub Release was published.
- [ ] No Vercel Production deployment was performed.
- [ ] Remaining uncertainty and Production blockers are stated below.

## Remaining uncertainty / rollback

List unverified provider, Windows, printer, accessibility, or operational behavior and the safe
rollback.
