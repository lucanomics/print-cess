import { afterEach, describe, expect, it, vi } from "vitest";

const { redirect } = vi.hoisted(() => ({ redirect: vi.fn() }));

vi.mock("next/navigation", () => ({ redirect }));

import HomePage from "./page";

describe("home page", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    redirect.mockReset();
  });

  it("opens the kiosk simulator from the deployment root when demo routes are enabled", () => {
    vi.stubEnv("ENABLE_DEMO_ROUTES", "true");

    HomePage();

    expect(redirect).toHaveBeenCalledWith("/demo/kiosk");
  });

  it("keeps the production status page when demo routes are disabled", () => {
    vi.stubEnv("ENABLE_DEMO_ROUTES", "false");

    const page = HomePage();

    expect(redirect).not.toHaveBeenCalled();
    expect(page.props.className).toBe("status-page");
  });
});
