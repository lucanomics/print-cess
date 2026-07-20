export type ServiceErrorCode =
  | "bad_request"
  | "unauthorized"
  | "not_found"
  | "expired"
  | "conflict"
  | "rate_limited"
  | "unavailable";

export class ServiceError extends Error {
  public constructor(
    public readonly code: ServiceErrorCode,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ServiceError";
  }
}

export function publicErrorBody(error: unknown): {
  error: { code: ServiceErrorCode; message: string };
} {
  if (error instanceof ServiceError) {
    return { error: { code: error.code, message: error.message } };
  }
  return {
    error: {
      code: "unavailable",
      message: "The printing service is temporarily unavailable.",
    },
  };
}
