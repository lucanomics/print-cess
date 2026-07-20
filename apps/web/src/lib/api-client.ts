type ApiErrorBody = { error?: { code?: string; message?: string } };

export class ApiClientError extends Error {
  public constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

async function apiJson<T>(url: string, init: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  const body = (await response.json().catch(() => ({}))) as ApiErrorBody & T;
  if (!response.ok) {
    throw new ApiClientError(
      body.error?.code ?? "networkError",
      body.error?.message ?? "Request failed",
      response.status,
    );
  }
  return body;
}

export async function claimSession(input: {
  sessionId: string;
  uploadToken: string;
  mobileTokenHash: string;
  claimIdHash: string;
}) {
  return apiJson<{
    protocolVersion: 1;
    sessionId: string;
    status: string;
    expiresAt: number;
    kioskPublicKey: string;
    kioskPublicKeyFingerprint: string;
  }>(`/api/sessions/${input.sessionId}/claim`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-print-cess-upload-token": input.uploadToken },
    body: JSON.stringify({
      mobileTokenHash: input.mobileTokenHash,
      claimIdHash: input.claimIdHash,
    }),
  });
}

export async function authorizeUpload(
  sessionId: string,
  mobileToken: string,
  operationIdHash: string,
) {
  return apiJson<{
    method: "PUT";
    url: string;
    headers: Record<string, string>;
    expiresAt: number;
    maximumSize: number;
  }>(`/api/sessions/${sessionId}/upload/authorize`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-print-cess-mobile-token": mobileToken },
    body: JSON.stringify({ operationIdHash }),
  });
}

export async function startUpload(sessionId: string, mobileToken: string) {
  return apiJson<{ status: string }>(`/api/sessions/${sessionId}/upload/start`, {
    method: "POST",
    headers: { "x-print-cess-mobile-token": mobileToken },
  });
}

export async function uploadCiphertext(
  operation: { url: string; headers: Record<string, string> },
  bytes: Uint8Array,
) {
  const response = await fetch(operation.url, {
    method: "PUT",
    headers: operation.headers,
    body: Uint8Array.from(bytes).buffer,
    signal: AbortSignal.timeout(120_000),
  });
  const body = (await response.json().catch(() => ({}))) as { etag?: string };
  if (!response.ok)
    throw new ApiClientError("networkError", "Encrypted upload failed", response.status);
  const etag = body.etag ?? response.headers.get("etag");
  if (!etag) throw new ApiClientError("networkError", "Encrypted upload metadata was missing", 502);
  return { etag, size: bytes.byteLength };
}

export async function completeUpload(
  sessionId: string,
  mobileToken: string,
  metadata: { etag: string; size: number },
) {
  return apiJson<{ status: string }>(`/api/sessions/${sessionId}/upload/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-print-cess-mobile-token": mobileToken },
    body: JSON.stringify(metadata),
  });
}

export async function getMobileStatus(sessionId: string, mobileToken: string) {
  return apiJson<{ status: string; expiresAt: number }>(`/api/sessions/${sessionId}/status`, {
    method: "GET",
    headers: { "x-print-cess-mobile-token": mobileToken },
  });
}

export async function cancelSession(sessionId: string, mobileToken: string) {
  return apiJson<{ status: "cancelled" }>(`/api/sessions/${sessionId}/cancel`, {
    method: "POST",
    headers: { "x-print-cess-mobile-token": mobileToken },
  });
}
