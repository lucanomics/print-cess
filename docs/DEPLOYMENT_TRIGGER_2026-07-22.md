# Vercel Preview deployment trigger

This documentation-only commit intentionally triggers a fresh Vercel Preview deployment from the latest protected `main` state after PR #21.

Verified repository state before triggering:

- `apps/web/vercel.json` builds the monorepo web workspace through the repository-root Turborepo pipeline.
- Git-triggered Preview deployments are enabled for non-`main` branches.
- Automatic Production deployment from `main` remains disabled until the documented provider, privacy, security, and institutional release gates are closed.
- CI and Security checks passed for the deployment configuration change merged in PR #21.

The deployment created from this branch is the preferred source deployment for a Vercel **Redeploy** action. Redeploying an older failed deployment can rebuild the older commit and reproduce its obsolete build settings.
