import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return {
    ...actual,
    after: (callback: () => void | Promise<void>) => {
      void callback();
    },
  };
});

import { POST } from "./route";

const requestBody = {
  protocolVersion: 1,
  kioskPublicKey: `B${"A".repeat(86)}`,
  kioskPublicKeyFingerprint: "A".repeat(43),
};

function createRequest(origin?: string): Request {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (origin) headers.set("Origin", origin);
  return new Request("http://localhost:3000/api/demo/sessions", {
    method: "POST",
    headers,
    body: JSON.stringify(requestBody),
  });
}

describe("demo kiosk session registration route", () => {
  beforeEach(() => {
    vi.stubEnv("PRINT_CESS_ADAPTER_MODE", "local");
    vi.stubEnv("PUBLIC_BASE_URL", "http://localhost:3000");
    vi.stubEnv("ALLOWED_ORIGINS", "http://localhost:3000");
    vi.stubEnv("ENABLE_DEMO_ROUTES", "true");
    globalThis.__printCessRuntime = undefined;
  });

  afterEach(() => {
    globalThis.__printCessRuntime = undefined;
    vi.unstubAllEnvs();
  });

  it("creates a session for the enabled same-origin browser simulator", async () => {
    const response = await POST(createRequest("http://localhost:3000"));

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      protocolVersion: 1,
      status: "waiting",
      qrUrl: expect.stringMatching(/^http:\/\/localhost:3000\/s\//u),
    });
  });

  it("uses the stable Vercel branch URL for Preview QR sessions", async () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("VERCEL_BRANCH_URL", "print-cess-git-preview.example.vercel.app");
    vi.stubEnv("VERCEL_URL", "print-cess-commit.example.vercel.app");
    const origin = "https://print-cess-git-preview.example.vercel.app";

    const response = await POST(createRequest(origin));

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      qrUrl: expect.stringMatching(/^https:\/\/print-cess-git-preview\.example\.vercel\.app\/s\//u),
    });
  });

  it("accepts the commit-specific Vercel Preview URL", async () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("VERCEL_BRANCH_URL", "print-cess-git-preview.example.vercel.app");
    vi.stubEnv("VERCEL_URL", "print-cess-commit.example.vercel.app");
    const origin = "https://print-cess-commit.example.vercel.app";

    const response = await POST(createRequest(origin));

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      qrUrl: expect.stringMatching(/^https:\/\/print-cess-commit\.example\.vercel\.app\/s\//u),
    });
  });

  it("does not trust an unrelated origin merely because it is a Preview", async () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("VERCEL_BRANCH_URL", "print-cess-git-preview.example.vercel.app");
    vi.stubEnv("VERCEL_URL", "print-cess-commit.example.vercel.app");

    const response = await POST(createRequest("https://unrelated.example.vercel.app"));

    expect(response.status).toBe(403);
  });

  it("rejects requests without a browser origin", async () => {
    const response = await POST(createRequest());

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "unauthorized" },
    });
  });

  it("stays unavailable when demo routes are disabled", async () => {
    vi.stubEnv("ENABLE_DEMO_ROUTES", "false");

    const response = await POST(createRequest("http://localhost:3000"));

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "not_found" },
    });
  });
});
