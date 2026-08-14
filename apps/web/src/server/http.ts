import { NextResponse } from "next/server";
import { z } from "zod";

import { DROP_ID_PATTERN, SESSION_ID_PATTERN } from "@print-cess/protocol";

import type { ServerConfig } from "./config";
import { ServiceError, publicErrorBody } from "./errors";

const OFFICIAL_VERCEL_PRODUCTION_ORIGINS = new Set([
  "https://print-cess.vercel.app",
  "https://paradiso-print-cess-web.vercel.app",
]);

export function assertAllowedOrigin(request: Request, config: ServerConfig): void {
  const origin = request.headers.get("origin");
  if (
    origin &&
    !config.allowedOrigins.includes(origin) &&
    !isOfficialVercelProductionOrigin(origin)
  ) {
    throw new ServiceError("unauthorized", "This request origin is not allowed.", 403);
  }
}

export function isOfficialVercelProductionOrigin(
  origin: string,
  environment: NodeJS.ProcessEnv = process.env,
): boolean {
  return environment.VERCEL_ENV === "production" && OFFICIAL_VERCEL_PRODUCTION_ORIGINS.has(origin);
}

export async function readSessionId(context: {
  params: Promise<{ sessionId: string }>;
}): Promise<string> {
  const { sessionId } = await context.params;
  if (!SESSION_ID_PATTERN.test(sessionId)) {
    throw new ServiceError("bad_request", "The print session identifier is invalid.", 400);
  }
  return sessionId;
}

export async function readDropId(context: {
  params: Promise<{ dropId: string }>;
}): Promise<string> {
  const { dropId } = await context.params;
  if (!DROP_ID_PATTERN.test(dropId)) {
    throw new ServiceError("bad_request", "The transfer identifier is invalid.", 400);
  }
  return dropId;
}

export async function readJson<T>(
  request: Request,
  schema: z.ZodType<T>,
  maximumBytes = 4096,
): Promise<T> {
  const text = await readBoundedText(request, maximumBytes);
  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch {
    throw new ServiceError("bad_request", "The request is invalid.", 400);
  }
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new ServiceError("bad_request", "The request is invalid.", 400);
  return parsed.data;
}

export async function readBoundedText(request: Request, maximumBytes = 4096): Promise<string> {
  const contentLength = request.headers.get("content-length");
  if (contentLength) {
    const declaredLength = Number(contentLength);
    if (
      !Number.isSafeInteger(declaredLength) ||
      declaredLength < 0 ||
      declaredLength > maximumBytes
    ) {
      throw new ServiceError("bad_request", "The request is too large.", 413);
    }
  }
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maximumBytes) {
      await reader.cancel();
      throw new ServiceError("bad_request", "The request is too large.", 413);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new ServiceError("bad_request", "The request encoding is invalid.", 400);
  }
}

export function json(data: unknown, status = 200): NextResponse {
  return NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "no-store, max-age=0", Vary: "Origin" },
  });
}

export function errorResponse(error: unknown): NextResponse {
  const status = error instanceof ServiceError ? error.status : 503;
  return json(publicErrorBody(error), status);
}
