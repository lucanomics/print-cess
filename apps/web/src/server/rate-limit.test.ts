import { describe, expect, it } from "vitest";

import { assertUnderRateLimit, enforceRateLimit } from "./rate-limit";

describe("miss-only rate limiting", () => {
  it("blocks before a sixth protected operation reaches its store", () => {
    const key = "pairing-miss:test-five";
    for (let count = 0; count < 5; count += 1) {
      enforceRateLimit(key, 5, 60_000, 1_000);
    }
    expect(() => assertUnderRateLimit(key, 5, 60_000, 1_000)).toThrow("Too many wrong numbers.");
  });

  it("allows a fresh budget after its window expires", () => {
    const key = "pairing-miss:test-expiry";
    enforceRateLimit(key, 1, 1_000, 1_000);
    expect(() => assertUnderRateLimit(key, 1, 1_000, 1_999)).toThrow();
    expect(() => assertUnderRateLimit(key, 1, 1_000, 2_000)).not.toThrow();
  });
});
