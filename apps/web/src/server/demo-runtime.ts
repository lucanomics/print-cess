export function isHostedDemoEnabled(environment: NodeJS.ProcessEnv = process.env): boolean {
  return environment.ENABLE_DEMO_ROUTES === "true" || environment.VERCEL_ENV === "preview";
}
