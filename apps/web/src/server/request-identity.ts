/**
 * Coarse client identity for rate limiting only. It is never stored, logged, or
 * attached to a transfer; it exists so one phone cannot exhaust the service for
 * everyone else in the room.
 */
export function clientAddress(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || "local";
}
