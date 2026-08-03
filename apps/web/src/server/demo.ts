const DEDICATED_KIOSK_PREVIEW_BRANCH = "preview";

export function isBrowserKioskEnabled(environment: NodeJS.ProcessEnv = process.env): boolean {
  if (environment.ENABLE_BROWSER_KIOSK === "true") return true;

  // Keep the existing explicitly enabled demo and the dedicated Preview branch
  // working while allowing Production to expose only the browser kiosk.
  return isDemoRouteEnabled(environment);
}

export function isDemoRouteEnabled(environment: NodeJS.ProcessEnv = process.env): boolean {
  if (environment.ENABLE_DEMO_ROUTES === "true") return true;

  return (
    environment.VERCEL_ENV === "preview" &&
    environment.VERCEL_GIT_COMMIT_REF === DEDICATED_KIOSK_PREVIEW_BRANCH
  );
}
