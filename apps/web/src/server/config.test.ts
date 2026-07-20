import { describe, expect, it } from "vitest";

import { loadConfig } from "./config";

const productionEnvironment: NodeJS.ProcessEnv = {
  NODE_ENV: "production",
  PRINT_CESS_ADAPTER_MODE: "external",
  PUBLIC_BASE_URL: "https://print.example.test",
  ALLOWED_ORIGINS: "https://print.example.test",
  KIOSK_REGISTRATION_SECRET: "k".repeat(32),
  ADMIN_DIAGNOSTICS_SECRET: "a".repeat(32),
  BLOB_READ_WRITE_TOKEN: "b".repeat(20),
  UPSTASH_REDIS_REST_URL: "https://redis.example.test",
  UPSTASH_REDIS_REST_TOKEN: "r".repeat(20),
  QSTASH_TOKEN: "q".repeat(20),
  QSTASH_CURRENT_SIGNING_KEY: "c".repeat(20),
  QSTASH_NEXT_SIGNING_KEY: "n".repeat(20),
};

describe("loadConfig", () => {
  it("accepts a complete HTTPS production configuration", () => {
    expect(loadConfig(productionEnvironment)).toMatchObject({
      mode: "external",
      publicBaseUrl: "https://print.example.test",
      demoEnabled: false,
    });
  });

  it("rejects an insecure production public origin", () => {
    expect(() =>
      loadConfig({ ...productionEnvironment, PUBLIC_BASE_URL: "http://print.example.test" }),
    ).toThrow(/exact HTTPS origin/u);
  });

  it("rejects a weak kiosk registration secret", () => {
    expect(() =>
      loadConfig({ ...productionEnvironment, KIOSK_REGISTRATION_SECRET: "short" }),
    ).toThrow(/at least 32/u);
  });
});
