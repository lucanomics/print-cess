import { NextResponse } from "next/server";

import { LocalEncryptedBlobTransport } from "@/server/blob/local";
import { getRuntime } from "@/server/runtime";
import { errorResponse, json } from "@/server/http";
import { ServiceError } from "@/server/errors";

export const runtime = "nodejs";

function localTransport(): LocalEncryptedBlobTransport {
  const server = getRuntime();
  if (!server.config.demoEnabled || !(server.blobs instanceof LocalEncryptedBlobTransport)) {
    throw new ServiceError("not_found", "Development blob transport is disabled.", 404);
  }
  return server.blobs;
}

export async function PUT(request: Request) {
  try {
    const token = new URL(request.url).searchParams.get("t");
    if (!token) throw new ServiceError("unauthorized", "Signed blob token is missing.", 401);
    const metadata = await localTransport().put(request, token);
    return json(metadata, 201);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function GET(request: Request) {
  try {
    const token = new URL(request.url).searchParams.get("t");
    if (!token) throw new ServiceError("unauthorized", "Signed blob token is missing.", 401);
    const { bytes, metadata } = await localTransport().get(token);
    return new NextResponse(Uint8Array.from(bytes).buffer, {
      headers: {
        "Cache-Control": "no-store, max-age=0",
        "Content-Length": String(metadata.size),
        "Content-Type": "application/octet-stream",
        ETag: metadata.etag,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
