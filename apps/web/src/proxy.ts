import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

/**
 * Both halves of the service upload and download ciphertext straight from the
 * browser to blob storage, so the configured provider's origin has to be
 * connectable. Only the selected provider is admitted; an unset or malformed
 * S3 endpoint simply contributes nothing rather than widening the policy.
 */
export function blobConnectOrigins(environment: NodeJS.ProcessEnv = process.env): string[] {
  if (environment.PRINT_CESS_BLOB_PROVIDER !== "railway-s3") {
    return [
      "https://vercel.com",
      "https://*.blob.vercel-storage.com",
      "https://blob.vercel-storage.com",
    ];
  }
  const endpoint = environment.S3_ENDPOINT;
  if (!endpoint) return [];
  let origin: string;
  try {
    const url = new URL(endpoint);
    if (url.protocol !== "https:") return [];
    origin = url.origin;
  } catch {
    return [];
  }
  const bucket = environment.S3_BUCKET;
  // Virtual-hosted addressing puts the bucket in front of the endpoint host,
  // so that form is admitted too unless the deployment forces path style.
  if (!bucket || environment.S3_FORCE_PATH_STYLE === "true") return [origin];
  const url = new URL(origin);
  return [origin, `${url.protocol}//${bucket}.${url.host}`];
}

export function buildContentSecurityPolicy(
  nonce: string,
  isDevelopment: boolean,
  environment: NodeJS.ProcessEnv = process.env,
): string {
  const connectSources = ["'self'", ...blobConnectOrigins(environment)].join(" ");
  return [
    "default-src 'self'",
    "base-uri 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "object-src 'none'",
    "font-src 'self'",
    "frame-src 'self' blob:",
    "img-src 'self' blob: data:",
    "media-src 'self' blob:",
    `connect-src ${connectSources}`,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDevelopment ? " 'unsafe-eval'" : ""}`,
    "script-src-attr 'none'",
    `style-src 'self' ${isDevelopment ? "'unsafe-inline'" : `'nonce-${nonce}'`}`,
    "worker-src 'self' blob:",
    ...(isDevelopment ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const contentSecurityPolicy = buildContentSecurityPolicy(
    nonce,
    process.env.NODE_ENV === "development",
  );
  const requestHeaders = new Headers(request.headers);

  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", contentSecurityPolicy);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", contentSecurityPolicy);

  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
