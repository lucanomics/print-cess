const allowedSuites = new Set(["all", "blob", "redis", "qstash"]);
const suite = process.env.PROVIDER_TEST_SUITE ?? "all";

if (process.env.RUN_PROVIDER_INTEGRATION !== "true") {
  throw new Error(
    "Set RUN_PROVIDER_INTEGRATION=true only for an approved Preview integration run.",
  );
}
if (process.env.PROVIDER_ENVIRONMENT !== "preview") {
  throw new Error("Provider integration tests are restricted to PROVIDER_ENVIRONMENT=preview.");
}
if (process.env.PROVIDER_CONFIRM_SYNTHETIC_ONLY !== "true") {
  throw new Error("Confirm that the run uses synthetic data only.");
}
if (!allowedSuites.has(suite)) {
  throw new Error("PROVIDER_TEST_SUITE must be all, blob, redis, or qstash.");
}

const requirements = new Set();
if (suite === "all" || suite === "redis" || suite === "qstash") {
  requirements.add("UPSTASH_REDIS_REST_URL");
  requirements.add("UPSTASH_REDIS_REST_TOKEN");
}
if (suite === "all" || suite === "blob" || suite === "qstash") {
  requirements.add("BLOB_STORE_ID");
  requirements.add("BLOB_READ_WRITE_TOKEN");
}
if (suite === "all" || suite === "qstash") {
  requirements.add("QSTASH_TOKEN");
  requirements.add("QSTASH_CURRENT_SIGNING_KEY");
  requirements.add("QSTASH_NEXT_SIGNING_KEY");
  requirements.add("PROVIDER_BASE_URL");
}

const missing = [...requirements].filter((name) => !process.env[name]);
if (missing.length > 0) {
  throw new Error(`Missing required Preview provider variables: ${missing.join(", ")}`);
}

if (requirements.has("UPSTASH_REDIS_REST_URL")) {
  const redisUrl = new URL(process.env.UPSTASH_REDIS_REST_URL);
  if (redisUrl.protocol !== "https:") throw new Error("The Preview Redis endpoint must use HTTPS.");
}
if (requirements.has("PROVIDER_BASE_URL")) {
  const baseUrl = new URL(process.env.PROVIDER_BASE_URL);
  if (baseUrl.protocol !== "https:" || baseUrl.pathname !== "/") {
    throw new Error("PROVIDER_BASE_URL must be an exact HTTPS origin.");
  }
}

process.stdout.write(`Approved Preview provider preflight passed for suite: ${suite}\n`);
