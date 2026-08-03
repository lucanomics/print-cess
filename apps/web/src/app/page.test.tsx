import { afterEach, describe, expect, it, vi } from "vitest";

const { redirect } = vi.hoisted(() => ({ redirect: vi.fn() }));

vi.mock("next/navigation", () => ({ redirect }));

import HomePage from "./page";

describe("home page", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    redirect.mockReset();
  });

  it("opens the public browser kiosk from the deployment root", () => {
    vi.stubEnv("ENABLE_BROWSER_KIOSK", "true");
    vi.stubEnv("ENABLE_DEMO_ROUTES", "false");

    HomePage();

    expect(redirect).toHaveBeenCalledWith("/kiosk");
  });

  it("keeps the legacy demo flag compatible with the browser kiosk", () => {
    vi.stubEnv("ENABLE_BROWSER_KIOSK", "false");
    vi.stubEnv("ENABLE_DEMO_ROUTES", "true");

    HomePage();

    expect(redirect).toHaveBeenCalledWith("/kiosk");
  });

  it("opens the kiosk simulator on the dedicated Vercel Preview branch", () => {
    vi.stubEnv("ENABLE_DEMO_ROUTES", "false");
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("VERCEL_GIT_COMMIT_REF", "preview");

    HomePage();

    expect(redirect).toHaveBeenCalledWith("/kiosk");
  });

  it("keeps the status page on unrelated Preview branches", () => {
    vi.stubEnv("ENABLE_DEMO_ROUTES", "false");
    vi.stubEnv("ENABLE_BROWSER_KIOSK", "false");
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("VERCEL_GIT_COMMIT_REF", "feature/example");

    const page = HomePage();

    expect(redirect).not.toHaveBeenCalled();
    expect(page.props.className).toBe("status-page");
  });

  it("keeps the production status page when demo routes are disabled", () => {
    vi.stubEnv("ENABLE_DEMO_ROUTES", "false");
    vi.stubEnv("ENABLE_BROWSER_KIOSK", "false");
    vi.stubEnv("VERCEL_ENV", "production");

    const page = HomePage();

    expect(redirect).not.toHaveBeenCalled();
    expect(page.props.className).toBe("status-page");
  });
});
