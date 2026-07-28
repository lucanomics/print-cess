import { afterEach, describe, expect, it, vi } from "vitest";

const { notFound } = vi.hoisted(() => ({ notFound: vi.fn() }));

vi.mock("next/navigation", () => ({ notFound }));
vi.mock("@/components/kiosk/kiosk-simulator", () => ({
  KioskSimulator: () => <div data-testid="kiosk-simulator" />,
}));

import KioskDemoPage from "./page";

describe("kiosk demo page", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    notFound.mockReset();
  });

  it("renders on the dedicated Vercel Preview branch without the manual demo flag", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ENABLE_DEMO_ROUTES", "false");
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("VERCEL_GIT_COMMIT_REF", "preview");

    const page = KioskDemoPage();

    expect(notFound).not.toHaveBeenCalled();
    expect(page.type).toBeDefined();
  });

  it("stays hidden on unrelated Vercel Preview branches", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ENABLE_DEMO_ROUTES", "false");
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("VERCEL_GIT_COMMIT_REF", "feature/example");

    KioskDemoPage();

    expect(notFound).toHaveBeenCalledOnce();
  });

  it("stays hidden in Production when demo routes are disabled", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ENABLE_DEMO_ROUTES", "false");
    vi.stubEnv("VERCEL_ENV", "production");

    KioskDemoPage();

    expect(notFound).toHaveBeenCalledOnce();
  });
});
