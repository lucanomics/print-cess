import { ServiceError } from "./errors";

type Window = { count: number; resetAt: number };
const windows = new Map<string, Window>();

export function enforceRateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now = Date.now(),
): void {
  if (windows.size >= 5000) {
    for (const [candidate, value] of windows) {
      if (value.resetAt <= now) windows.delete(candidate);
    }
    if (windows.size >= 5000 && !windows.has(key)) {
      throw new ServiceError("rate_limited", "Too many requests. Try again shortly.", 429);
    }
  }
  const existing = windows.get(key);
  if (!existing || existing.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  existing.count += 1;
  if (existing.count > limit) {
    throw new ServiceError(
      "rate_limited",
      "Too many requests. Scan a current QR code and try again.",
      429,
    );
  }
}
