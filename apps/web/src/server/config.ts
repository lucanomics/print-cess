import { z } from "zod";

const configSchema = z.object({
  mode: z.enum(["local", "external"]),
  publicBaseUrl: z.string().url(),
  allowedOrigins: z.array(z.string().url()).min(1),
  sessionTtlMs: z.number().int().min(30_000).max(300_000),
  signedUrlTtlMs: z.number().int().min(15_000).max(180_000),
  demoEnabled: z.boolean(),
});

export type ServerConfig = z.infer<typeof configSchema>;

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): ServerConfig {
  const defaultOrigin = environment.PUBLIC_BASE_URL ?? "http://localhost:3000";
  const mode =
    environment.PRINT_CESS_ADAPTER_MODE ??
    (environment.NODE_ENV === "production" ? "external" : "local");
  if (environment.NODE_ENV === "production" && mode !== "external") {
    throw new Error("Production must use the external Redis, Blob, and QStash adapters");
  }
  const config = configSchema.parse({
    mode,
    publicBaseUrl: defaultOrigin,
    allowedOrigins: (environment.ALLOWED_ORIGINS ?? defaultOrigin)
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
    sessionTtlMs: Number(environment.SESSION_TTL_SECONDS ?? 180) * 1000,
    signedUrlTtlMs: Number(environment.SIGNED_URL_TTL_SECONDS ?? 120) * 1000,
    demoEnabled: environment.ENABLE_DEMO_ROUTES === "true" || environment.NODE_ENV !== "production",
  });
  if (environment.NODE_ENV === "production") {
    assertExactHttpsOrigin(config.publicBaseUrl, "PUBLIC_BASE_URL");
    for (const origin of config.allowedOrigins) assertExactHttpsOrigin(origin, "ALLOWED_ORIGINS");
    requireSecret(environment, "KIOSK_REGISTRATION_SECRET", 32);
    requireSecret(environment, "ADMIN_DIAGNOSTICS_SECRET", 32);
    requireSecret(environment, "BLOB_READ_WRITE_TOKEN", 20);
    requireHttpsUrl(environment, "UPSTASH_REDIS_REST_URL");
    requireSecret(environment, "UPSTASH_REDIS_REST_TOKEN", 20);
    requireSecret(environment, "QSTASH_TOKEN", 20);
    requireSecret(environment, "QSTASH_CURRENT_SIGNING_KEY", 20);
    requireSecret(environment, "QSTASH_NEXT_SIGNING_KEY", 20);
  }
  return config;
}

function assertExactHttpsOrigin(value: string, name: string): void {
  const url = new URL(value);
  if (url.protocol !== "https:" || value !== url.origin) {
    throw new Error(`${name} must be an exact HTTPS origin without a path, query, or fragment`);
  }
}

function requireHttpsUrl(environment: NodeJS.ProcessEnv, name: string): void {
  const value = environment[name];
  if (!value || new URL(value).protocol !== "https:") {
    throw new Error(`${name} must be configured with HTTPS in production`);
  }
}

function requireSecret(environment: NodeJS.ProcessEnv, name: string, minimumLength: number): void {
  const value = environment[name];
  if (!value || value.length < minimumLength) {
    throw new Error(`${name} must contain at least ${minimumLength} characters in production`);
  }
}
