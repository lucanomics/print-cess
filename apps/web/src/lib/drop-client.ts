import type { DropOpenView, DropSenderView } from "@print-cess/protocol";

import { ApiClientError } from "./api-client";

export type DropOperation = {
  index: number;
  method: "PUT" | "GET";
  url: string;
  headers: Record<string, string>;
  expiresAt: number;
  maximumSize?: number;
  size?: number;
};

export type CreatedDrop = {
  protocolVersion: 1;
  dropId: string;
  status: "collecting";
  expiresAt: number;
  chunkBytes: number;
  maximumPartBytes: number;
};

async function dropJson<T>(url: string, init: RequestInit, timeoutMs = 20_000): Promise<T> {
  const response = await fetch(url, {
    ...init,
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
  });
  const body = (await response.json().catch(() => ({}))) as {
    error?: { code?: string; message?: string };
  } & T;
  if (!response.ok) {
    throw new ApiClientError(
      body.error?.code ?? "networkError",
      body.error?.message ?? "Request failed",
      response.status,
    );
  }
  return body;
}

function ownerHeaders(ownerToken: string, json = true): Record<string, string> {
  return {
    ...(json ? { "Content-Type": "application/json" } : {}),
    "x-print-cess-drop-token": ownerToken,
  };
}

export async function createDrop(input: {
  dropId: string;
  ownerTokenHash: string;
  manifest: string;
  fileCount: number;
  partCount: number;
}): Promise<CreatedDrop> {
  return dropJson<CreatedDrop>("/api/drops", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ protocolVersion: 1, ...input }),
  });
}

export async function authorizeDropParts(
  dropId: string,
  ownerToken: string,
  indexes: readonly number[],
): Promise<DropOperation[]> {
  const body = await dropJson<{ operations: DropOperation[] }>(`/api/drops/${dropId}/parts`, {
    method: "POST",
    headers: ownerHeaders(ownerToken),
    body: JSON.stringify({ indexes }),
  });
  return body.operations;
}

export async function commitDropParts(
  dropId: string,
  ownerToken: string,
  parts: readonly { index: number; size: number }[],
): Promise<{ uploadedPartCount: number; partCount: number }> {
  return dropJson(`/api/drops/${dropId}/parts/complete`, {
    method: "POST",
    headers: ownerHeaders(ownerToken),
    body: JSON.stringify({ parts }),
  });
}

export async function sealDrop(dropId: string, ownerToken: string): Promise<{ status: string }> {
  return dropJson(`/api/drops/${dropId}/seal`, {
    method: "POST",
    headers: ownerHeaders(ownerToken, false),
  });
}

export async function getDropStatus(dropId: string, ownerToken: string): Promise<DropSenderView> {
  return dropJson<DropSenderView>(`/api/drops/${dropId}`, {
    method: "GET",
    headers: ownerHeaders(ownerToken, false),
  });
}

export async function revokeDrop(dropId: string, ownerToken: string): Promise<void> {
  await dropJson(`/api/drops/${dropId}`, {
    method: "DELETE",
    headers: ownerHeaders(ownerToken, false),
  });
}

export async function openDrop(dropId: string): Promise<DropOpenView> {
  return dropJson<DropOpenView>(`/api/drops/${dropId}/open`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
}

export async function authorizeDropDownload(
  dropId: string,
  indexes: readonly number[],
): Promise<DropOperation[]> {
  const body = await dropJson<{ operations: DropOperation[] }>(`/api/drops/${dropId}/download`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ indexes }),
  });
  return body.operations;
}

export { ApiClientError };
