import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "./route";

describe("administrator health route", () => {
  beforeEach(() => {
    vi.stubEnv("PRINT_CESS_ADAPTER_MODE", "local");
    vi.stubEnv("PUBLIC_BASE_URL", "http://localhost:3000");
    vi.stubEnv("ALLOWED_ORIGINS", "http://localhost:3000");
    vi.stubEnv("ADMIN_DIAGNOSTICS_SECRET", "synthetic-admin-diagnostics-secret");
    globalThis.__printCessRuntime = undefined;
  });

  afterEach(() => {
    globalThis.__printCessRuntime = undefined;
    vi.unstubAllEnvs();
  });

  it("rejects a missing administrator credential", async () => {
    const response = await GET(new Request("http://localhost:3000/api/admin/health"));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "unauthorized" },
    });
  });

  it("reports local adapter readiness without exposing configuration", async () => {
    const response = await GET(
      new Request("http://localhost:3000/api/admin/health", {
        headers: { "x-admin-secret": "synthetic-admin-diagnostics-secret" },
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      adapterMode: "local",
      blob: "encrypted-local-ready",
      cleanup: "in-process-ready",
      server: "ready",
      sessionStore: "ready",
    });
  });
});
