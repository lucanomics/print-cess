import { describe, expect, it } from "vitest";

import { readPostgresTlsServerName } from "./postgres-client";

describe("PostgreSQL TLS server identity", () => {
  it("verifies Railway's documented certificate identity by default", () => {
    expect(readPostgresTlsServerName({ NODE_ENV: "test" })).toBe("localhost");
  });

  it("accepts an explicitly approved DNS certificate identity", () => {
    expect(
      readPostgresTlsServerName({
        NODE_ENV: "test",
        POSTGRES_TLS_SERVER_NAME: "database.internal.example",
      }),
    ).toBe("database.internal.example");
  });

  it.each([
    " database.internal.example",
    "database.internal.example ",
    "127.0.0.1",
    "*.internal.example",
    "database/internal",
    "-database.internal",
  ])("rejects an invalid TLS certificate identity: %s", (value) => {
    expect(() =>
      readPostgresTlsServerName({ NODE_ENV: "test", POSTGRES_TLS_SERVER_NAME: value }),
    ).toThrow(/valid DNS host name/u);
  });
});
