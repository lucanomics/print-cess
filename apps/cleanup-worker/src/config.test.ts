import { describe, expect, it } from "vitest";

import { parseWorkerConfig } from "./config";

const baseEnv: NodeJS.ProcessEnv = {
  CLEANUP_ENDPOINT: "https://app.example.test/api/cleanup",
  CLEANUP_WORKER_SECRET: "w".repeat(32),
};

describe("parseWorkerConfig", () => {
  it("applies documented defaults", () => {
    expect(parseWorkerConfig(baseEnv)).toEqual({
      endpoint: "https://app.example.test/api/cleanup",
      secret: "w".repeat(32),
      intervalMs: 5_000,
      batchSize: 25,
      requestTimeoutMs: 10_000,
      maxBackoffMs: 60_000,
    });
  });

  it("reads overrides for interval, batch size, and timeout", () => {
    expect(
      parseWorkerConfig({
        ...baseEnv,
        CLEANUP_INTERVAL_MS: "1000",
        CLEANUP_BATCH_SIZE: "50",
        CLEANUP_REQUEST_TIMEOUT_MS: "3000",
      }),
    ).toMatchObject({ intervalMs: 1_000, batchSize: 50, requestTimeoutMs: 3_000 });
  });

  it("rejects a non-HTTPS endpoint", () => {
    expect(() =>
      parseWorkerConfig({ ...baseEnv, CLEANUP_ENDPOINT: "http://app.example.test/api/cleanup" }),
    ).toThrow(/HTTPS/u);
  });

  it("rejects an endpoint that is not exactly /api/cleanup", () => {
    expect(() =>
      parseWorkerConfig({ ...baseEnv, CLEANUP_ENDPOINT: "https://app.example.test/api/cleanup/x" }),
    ).toThrow(/exact \/api\/cleanup/u);
  });

  it("rejects an endpoint with a query string", () => {
    expect(() =>
      parseWorkerConfig({
        ...baseEnv,
        CLEANUP_ENDPOINT: "https://app.example.test/api/cleanup?a=1",
      }),
    ).toThrow(/exact \/api\/cleanup/u);
  });

  it("rejects a weak worker secret", () => {
    expect(() => parseWorkerConfig({ ...baseEnv, CLEANUP_WORKER_SECRET: "short" })).toThrow(
      /at least 32/u,
    );
  });

  it("rejects an out-of-range batch size", () => {
    expect(() => parseWorkerConfig({ ...baseEnv, CLEANUP_BATCH_SIZE: "0" })).toThrow(/\[1, 100\]/u);
  });
});
