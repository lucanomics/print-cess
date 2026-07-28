const DEDICATED_KIOSK_PREVIEW_BRANCH = "preview";

export function isDemoRouteEnabled(environment: NodeJS.ProcessEnv = process.env): boolean {
  if (environment.ENABLE_DEMO_ROUTES === "true") return true;

  return (
    environment.VERCEL_ENV === "preview" &&
    environment.VERCEL_GIT_COMMIT_REF === DEDICATED_KIOSK_PREVIEW_BRANCH
  );
}
