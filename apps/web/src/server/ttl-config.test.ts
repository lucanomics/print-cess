import { describe, expect, it } from "vitest";

import { loadConfig } from "./config";

describe("session lifetime configuration", () => {
  it("uses a two-minute public QR window and a three-minute claimed session window", () => {
    expect(loadConfig({ NODE_ENV: "test", PRINT_CESS_ADAPTER_MODE: "local" })).toMatchObject({
      qrTtlMs: 120_000,
      sessionTtlMs: 180_000,
    });
  });

  it("rejects a public QR lifetime longer than the claimed session lifetime", () => {
    expect(() =>
      loadConfig({
        NODE_ENV: "test",
        PRINT_CESS_ADAPTER_MODE: "local",
        QR_TTL_SECONDS: "240",
        SESSION_TTL_SECONDS: "180",
      }),
    ).toThrow(/QR_TTL_SECONDS must not exceed SESSION_TTL_SECONDS/u);
  });
});
