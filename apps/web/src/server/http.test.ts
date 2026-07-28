import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import type { ServerConfig } from "./config";
import { assertAllowedOrigin, readJson, readSessionId } from "./http";

const schema = z.object({ value: z.string() }).strict();

const config: ServerConfig = {
  mode: "local",
  sessionProvider: null,
  blobProvider: null,
  cleanupProvider: null,
  publicBaseUrl: "https://configured.example.test",
  allowedOrigins: ["https://configured.example.test"],
  sessionTtlMs: 180_000,
  signedUrlTtlMs: 120_000,
  demoEnabled: true,
};

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("assertAllowedOrigin", () => {
  it("accepts the active same-origin host when demo routes are enabled", () => {
    vi.stubEnv("ENABLE_DEMO_ROUTES", "true");
    const request = new Request("https://branch-preview.example.test/api/sessions", {
      headers: { Origin: "https://branch-preview.example.test" },
    });

    expect(() => assertAllowedOrigin(request, config)).not.toThrow();
  });

  it("still rejects cross-origin requests in demo mode", () => {
    vi.stubEnv("ENABLE_DEMO_ROUTES", "true");
    const request = new Request("https://branch-preview.example.test/api/sessions", {
      headers: { Origin: "https://attacker.example.test" },
    });

    expect(() => assertAllowedOrigin(request, config)).toThrowError(
      expect.objectContaining({ code: "unauthorized", status: 403 }),
    );
  });

  it("keeps the configured allow-list in normal deployments", () => {
    vi.stubEnv("ENABLE_DEMO_ROUTES", "false");
    const request = new Request("https://branch-preview.example.test/api/sessions", {
      headers: { Origin: "https://branch-preview.example.test" },
    });

    expect(() => assertAllowedOrigin(request, config)).toThrowError(
      expect.objectContaining({ code: "unauthorized", status: 403 }),
    );
  });
});

describe("readJson", () => {
  it("parses and validates a bounded JSON body", async () => {
    const request = new Request("https://print.example.test/api", {
      method: "POST",
      body: JSON.stringify({ value: "safe" }),
    });

    await expect(readJson(request, schema)).resolves.toEqual({ value: "safe" });
  });

  it("maps malformed JSON to a public 400 error", async () => {
    const request = new Request("https://print.example.test/api", {
      method: "POST",
      body: "{",
    });

    await expect(readJson(request, schema)).rejects.toMatchObject({
      code: "bad_request",
      status: 400,
    });
  });

  it("rejects unknown JSON members instead of silently stripping them", async () => {
    const request = new Request("https://print.example.test/api", {
      method: "POST",
      body: JSON.stringify({ value: "safe", unexpected: true }),
    });

    await expect(readJson(request, schema)).rejects.toMatchObject({
      code: "bad_request",
      status: 400,
    });
  });

  it("rejects a body that exceeds the byte limit", async () => {
    const request = new Request("https://print.example.test/api", {
      method: "POST",
      body: JSON.stringify({ value: "four bytes" }),
    });

    await expect(readJson(request, schema, 4)).rejects.toMatchObject({
      code: "bad_request",
      status: 413,
    });
  });
});

describe("readSessionId", () => {
  it("rejects non-canonical dynamic route identifiers before store access", async () => {
    await expect(
      readSessionId({ params: Promise.resolve({ sessionId: "../unbounded-key" }) }),
    ).rejects.toMatchObject({ code: "bad_request", status: 400 });
    await expect(
      readSessionId({
        params: Promise.resolve({ sessionId: `${"A".repeat(21)}B` }),
      }),
    ).rejects.toMatchObject({ code: "bad_request", status: 400 });
  });
});
