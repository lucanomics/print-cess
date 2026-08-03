import { afterEach, describe, expect, it, vi } from "vitest";

const { notFound } = vi.hoisted(() => ({ notFound: vi.fn() }));

vi.mock("next/navigation", () => ({ notFound }));
vi.mock("@/components/kiosk/kiosk-simulator", () => ({
  KioskSimulator: () => <div data-testid="kiosk-simulator" />,
}));

import BrowserKioskPage from "./page";

describe("public browser kiosk page", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    notFound.mockReset();
  });

  it("renders in Production when the browser kiosk is enabled", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ENABLE_BROWSER_KIOSK", "true");
    vi.stubEnv("ENABLE_DEMO_ROUTES", "false");

    const page = BrowserKioskPage();

    expect(notFound).not.toHaveBeenCalled();
    expect(page.type).toBeDefined();
  });

  it("stays hidden in Production when the browser kiosk is disabled", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ENABLE_BROWSER_KIOSK", "false");
    vi.stubEnv("ENABLE_DEMO_ROUTES", "false");

    BrowserKioskPage();

    expect(notFound).toHaveBeenCalledOnce();
  });
});
