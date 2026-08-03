import { afterEach, describe, expect, it, vi } from "vitest";

const { notFound } = vi.hoisted(() => ({ notFound: vi.fn() }));

vi.mock("next/navigation", () => ({ notFound }));
vi.mock("@/components/admin/admin-simulator", () => ({
  AdminSimulator: () => <div data-testid="admin-simulator" />,
}));

import AdminDemoPage from "./page";

describe("administrator demo page", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    notFound.mockReset();
  });

  it("is not exposed when only the public browser kiosk is enabled", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ENABLE_BROWSER_KIOSK", "true");
    vi.stubEnv("ENABLE_DEMO_ROUTES", "false");

    AdminDemoPage();

    expect(notFound).toHaveBeenCalledOnce();
  });
});
