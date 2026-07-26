import { randomBytes } from "node:crypto";

/**
 * Shared helpers for the Preview provisioning scripts.
 *
 * Every helper here exists to keep credentials out of stdout, stderr, argv, and
 * shell history. Scripts in this directory must never print a token, a Redis
 * URL, an S3 secret, or a signed URL — only masked descriptors.
 */

/** Describe a secret without revealing it: length plus a short prefix marker. */
export function describeSecret(value) {
  if (typeof value !== "string" || value.length === 0) return "absent";
  return `configured, length ${value.length}, value=[REDACTED]`;
}

/** Describe a URL by origin shape only, never the credentials or path. */
export function describeUrl(value) {
  if (typeof value !== "string" || value.length === 0) return "absent";
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return "present but not a valid URL";
  }
  const host = parsed.hostname;
  const masked = host.length > 6 ? `${host.slice(0, 3)}***${host.slice(-3)}` : "***";
  return `${parsed.protocol}//${masked} (credentials redacted)`;
}

/** Cryptographically strong secret, URL-safe, at least `bytes` of entropy. */
export function generateSecret(bytes = 32) {
  return randomBytes(bytes).toString("base64url");
}

/**
 * Read a required environment variable without echoing it. Throws a message
 * that names the variable but never its value.
 */
export function requireEnvironment(name, { minimumLength = 1 } = {}) {
  const value = process.env[name];
  if (!value || value.length < minimumLength) {
    throw new Error(
      `${name} must be set in the environment` +
        (minimumLength > 1 ? ` with at least ${minimumLength} characters` : "") +
        ". Never pass it as a command-line argument.",
    );
  }
  return value;
}

/** POST JSON and return the parsed body, with credential-free error text. */
export async function postJson(url, { headers = {}, body, timeoutMs = 30_000 }) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await response.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    // Non-JSON bodies are surfaced as a status-only failure below.
  }
  if (!response.ok) {
    // Include the status and any provider error code, never the raw body (it
    // can echo request values) and never the URL query.
    const code = parsed?.error?.code ?? parsed?.errors?.[0]?.message ?? "";
    throw new Error(`HTTP ${response.status}${code ? ` (${truncate(String(code))})` : ""}`);
  }
  return parsed;
}

function truncate(value, max = 120) {
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

/** Print a masked, structured line to stdout. */
export function report(label, detail) {
  process.stdout.write(`${label}: ${detail}\n`);
}
