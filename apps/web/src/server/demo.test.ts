import { describe, expect, it } from "vitest";

import { isBrowserKioskEnabled, isDemoRouteEnabled } from "./demo";

describe("browser kiosk and demo route gates", () => {
  it("enables only the browser kiosk with its Production flag", () => {
    const environment: NodeJS.ProcessEnv = {
      NODE_ENV: "production",
      VERCEL_ENV: "production",
      ENABLE_BROWSER_KIOSK: "true",
      ENABLE_DEMO_ROUTES: "false",
    };

    expect(isBrowserKioskEnabled(environment)).toBe(true);
    expect(isDemoRouteEnabled(environment)).toBe(false);
  });

  it("keeps both route groups disabled by default in Production", () => {
    const environment: NodeJS.ProcessEnv = {
      NODE_ENV: "production",
      VERCEL_ENV: "production",
      ENABLE_BROWSER_KIOSK: "false",
      ENABLE_DEMO_ROUTES: "false",
    };

    expect(isBrowserKioskEnabled(environment)).toBe(false);
    expect(isDemoRouteEnabled(environment)).toBe(false);
  });

  it("ignores an accidentally enabled demo flag in Vercel Production", () => {
    const environment: NodeJS.ProcessEnv = {
      NODE_ENV: "production",
      VERCEL_ENV: "production",
      ENABLE_BROWSER_KIOSK: "false",
      ENABLE_DEMO_ROUTES: "true",
    };

    expect(isBrowserKioskEnabled(environment)).toBe(false);
    expect(isDemoRouteEnabled(environment)).toBe(false);
  });

  it("fails closed for a non-Vercel Production deployment", () => {
    const environment: NodeJS.ProcessEnv = {
      NODE_ENV: "production",
      ENABLE_BROWSER_KIOSK: "false",
      ENABLE_DEMO_ROUTES: "true",
    };

    expect(isBrowserKioskEnabled(environment)).toBe(false);
    expect(isDemoRouteEnabled(environment)).toBe(false);
  });

  it("keeps the dedicated Preview branch compatible", () => {
    const environment: NodeJS.ProcessEnv = {
      NODE_ENV: "production",
      VERCEL_ENV: "preview",
      VERCEL_GIT_COMMIT_REF: "preview",
      ENABLE_BROWSER_KIOSK: "false",
      ENABLE_DEMO_ROUTES: "false",
    };

    expect(isBrowserKioskEnabled(environment)).toBe(true);
    expect(isDemoRouteEnabled(environment)).toBe(true);
  });
});
