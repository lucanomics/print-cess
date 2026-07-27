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

  it("defaults external mode to the legacy Upstash/Vercel/QStash providers", () => {
    expect(loadConfig(productionEnvironment)).toMatchObject({
      sessionProvider: "upstash-redis",
      blobProvider: "vercel-blob",
      cleanupProvider: "qstash",
    });
  });

  it("leaves provider selectors null in local mode", () => {
    expect(loadConfig({ NODE_ENV: "test", PRINT_CESS_ADAPTER_MODE: "local" })).toMatchObject({
      mode: "local",
      sessionProvider: null,
      blobProvider: null,
      cleanupProvider: null,
    });
  });

  it("rejects an unknown provider selector value", () => {
    expect(() =>
      loadConfig({ ...productionEnvironment, PRINT_CESS_SESSION_PROVIDER: "dynamo" }),
    ).toThrow(/PRINT_CESS_SESSION_PROVIDER must be one of/u);
  });
});

const railwayEnvironment: NodeJS.ProcessEnv = {
  NODE_ENV: "production",
  PRINT_CESS_ADAPTER_MODE: "external",
  PUBLIC_BASE_URL: "https://print.example.test",
  ALLOWED_ORIGINS: "https://print.example.test",
  KIOSK_REGISTRATION_SECRET: "k".repeat(32),
  ADMIN_DIAGNOSTICS_SECRET: "a".repeat(32),
  PRINT_CESS_SESSION_PROVIDER: "railway-redis",
  PRINT_CESS_BLOB_PROVIDER: "railway-s3",
  PRINT_CESS_CLEANUP_PROVIDER: "railway-worker",
  REDIS_URL: "rediss://default:secret@redis.railway.internal:6379",
  S3_ENDPOINT: "https://bucket.railway.app",
  S3_REGION: "us-east-1",
  S3_BUCKET: "print-cess-preview",
  S3_ACCESS_KEY_ID: "AKIAEXAMPLE",
  S3_SECRET_ACCESS_KEY: "s".repeat(40),
  CLEANUP_WORKER_SECRET: "w".repeat(32),
};

describe("loadConfig Railway provider selection", () => {
  it("accepts a complete Railway provider configuration", () => {
    expect(loadConfig(railwayEnvironment)).toMatchObject({
      mode: "external",
      sessionProvider: "railway-redis",
      blobProvider: "railway-s3",
      cleanupProvider: "railway-worker",
    });
  });

  it("rejects a non-TLS Railway Redis URL", () => {
    expect(() =>
      loadConfig({ ...railwayEnvironment, REDIS_URL: "redis://redis.railway.internal:6379" }),
    ).toThrow(/TLS connection/u);
  });

  it("rejects a missing Railway Redis URL", () => {
    const { REDIS_URL: _removed, ...withoutUrl } = railwayEnvironment;
    expect(() => loadConfig(withoutUrl)).toThrow(/REDIS_URL/u);
  });

  it("requires every S3 variable when the S3 blob provider is selected", () => {
    const { S3_BUCKET: _removed, ...withoutBucket } = railwayEnvironment;
    expect(() => loadConfig(withoutBucket)).toThrow(/S3_BUCKET/u);
  });

  it("requires a strong cleanup worker secret", () => {
    expect(() => loadConfig({ ...railwayEnvironment, CLEANUP_WORKER_SECRET: "short" })).toThrow(
      /CLEANUP_WORKER_SECRET must contain at least 32/u,
    );
  });

  it("does not demand unused legacy provider credentials", () => {
    expect(() => loadConfig(railwayEnvironment)).not.toThrow();
  });

  it("accepts the no-cost Postgres, Vercel Blob, and Railway worker mix", () => {
    expect(
      loadConfig({
        ...productionEnvironment,
        PRINT_CESS_SESSION_PROVIDER: "railway-postgres",
        PRINT_CESS_BLOB_PROVIDER: "vercel-blob",
        PRINT_CESS_CLEANUP_PROVIDER: "railway-worker",
        POSTGRES_URL: "postgresql://preview:secret@postgres.example.test:5432/railway",
        POSTGRES_CA_CERT:
          "-----BEGIN CERTIFICATE-----\nQUJDRA==\n-----END CERTIFICATE-----\n",
        CLEANUP_WORKER_SECRET: "w".repeat(32),
      }),
    ).toMatchObject({
      sessionProvider: "railway-postgres",
      blobProvider: "vercel-blob",
      cleanupProvider: "railway-worker",
    });
  });

  it("rejects a local PostgreSQL URL for the hosted adapter", () => {
    expect(() =>
      loadConfig({
        ...railwayEnvironment,
        PRINT_CESS_SESSION_PROVIDER: "railway-postgres",
        POSTGRES_URL: "postgresql://preview:secret@localhost:5432/railway",
        POSTGRES_CA_CERT:
          "-----BEGIN CERTIFICATE-----\nQUJDRA==\n-----END CERTIFICATE-----\n",
      }),
    ).toThrow(/remote TLS-enabled PostgreSQL host/u);
  });

  it("requires the selected PostgreSQL database root CA", () => {
    expect(() =>
      loadConfig({
        ...productionEnvironment,
        PRINT_CESS_SESSION_PROVIDER: "railway-postgres",
        PRINT_CESS_BLOB_PROVIDER: "vercel-blob",
        PRINT_CESS_CLEANUP_PROVIDER: "railway-worker",
        POSTGRES_URL: "postgresql://preview:secret@postgres.example.test:5432/railway",
        CLEANUP_WORKER_SECRET: "w".repeat(32),
      }),
    ).toThrow(/POSTGRES_CA_CERT/u);
  });
});
