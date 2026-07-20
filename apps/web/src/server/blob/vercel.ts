import { issueSignedToken, presignUrl } from "@vercel/blob";

import type { BlobMetadata, BlobTransport, SignedBlobOperation } from "../contracts";
import { ServiceError } from "../errors";

export class VercelBlobTransport implements BlobTransport {
  public async authorizeUpload(
    pathname: string,
    expiresAt: number,
    maximumSize: number,
  ): Promise<SignedBlobOperation> {
    const token = await issueSignedToken({
      pathname,
      operations: ["put"],
      validUntil: expiresAt,
      allowedContentTypes: ["application/octet-stream"],
      maximumSizeInBytes: maximumSize,
    });
    const { presignedUrl } = await presignUrl(token, {
      access: "private",
      operation: "put",
      pathname,
      validUntil: expiresAt,
      allowedContentTypes: ["application/octet-stream"],
      maximumSizeInBytes: maximumSize,
      allowOverwrite: false,
      addRandomSuffix: false,
    });
    return {
      method: "PUT",
      pathname,
      expiresAt,
      url: presignedUrl,
      headers: { "Content-Type": "application/octet-stream" },
    };
  }

  public async authorizeDownload(
    pathname: string,
    expiresAt: number,
  ): Promise<SignedBlobOperation> {
    const token = await issueSignedToken({ pathname, operations: ["get"], validUntil: expiresAt });
    const { presignedUrl } = await presignUrl(token, {
      access: "private",
      operation: "get",
      pathname,
      validUntil: expiresAt,
      useCache: false,
    });
    return { method: "GET", pathname, expiresAt, url: presignedUrl, headers: {} };
  }

  public async head(pathname: string): Promise<BlobMetadata> {
    const expiresAt = Date.now() + 30_000;
    const token = await issueSignedToken({ pathname, operations: ["head"], validUntil: expiresAt });
    const { presignedUrl } = await presignUrl(token, {
      access: "private",
      operation: "head",
      pathname,
      validUntil: expiresAt,
    });
    const response = await fetch(presignedUrl, {
      method: "HEAD",
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok)
      throw new ServiceError("not_found", "The encrypted upload was not found.", 404);
    const size = Number(response.headers.get("content-length"));
    const etag = response.headers.get("etag");
    if (!Number.isSafeInteger(size) || size < 1 || !etag) {
      throw new ServiceError("unavailable", "Blob metadata is incomplete.", 503);
    }
    return { size, etag };
  }

  public async delete(pathname: string, expectedEtag?: string): Promise<void> {
    const expiresAt = Date.now() + 30_000;
    const token = await issueSignedToken({
      pathname,
      operations: ["delete"],
      validUntil: expiresAt,
    });
    const { presignedUrl } = await presignUrl(token, {
      access: "private",
      operation: "delete",
      pathname,
      validUntil: expiresAt,
      ...(expectedEtag ? { ifMatch: expectedEtag } : {}),
    });
    const response = await fetch(presignedUrl, {
      method: "DELETE",
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok && response.status !== 404) {
      throw new ServiceError("unavailable", "Encrypted blob cleanup failed.", 503);
    }
  }
}
