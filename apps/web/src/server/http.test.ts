import { describe, expect, it } from "vitest";
import { z } from "zod";

import { readJson, readSessionId } from "./http";

const schema = z.object({ value: z.string() }).strict();

describe("readJson", () => {
  it("parses and validates a bounded JSON body", async () => {
    const request = new Request("https://print.example.test/api", {
      method: "POST",
      body: JSON.stringify({ value: "safe" }),
    });

    await expect(readJson(request, schema)).resolves.toEqual({ value: "safe" });
  });

  it("maps malformed JSON to a public 400 error", async () => {
    const request = new Request("https://print.example.test/api", {
      method: "POST",
      body: "{",
    });

    await expect(readJson(request, schema)).rejects.toMatchObject({
      code: "bad_request",
      status: 400,
    });
  });

  it("rejects unknown JSON members instead of silently stripping them", async () => {
    const request = new Request("https://print.example.test/api", {
      method: "POST",
      body: JSON.stringify({ value: "safe", unexpected: true }),
    });

    await expect(readJson(request, schema)).rejects.toMatchObject({
      code: "bad_request",
      status: 400,
    });
  });

  it("rejects a body that exceeds the byte limit", async () => {
    const request = new Request("https://print.example.test/api", {
      method: "POST",
      body: JSON.stringify({ value: "four bytes" }),
    });

    await expect(readJson(request, schema, 4)).rejects.toMatchObject({
      code: "bad_request",
      status: 413,
    });
  });
});

describe("readSessionId", () => {
  it("rejects non-canonical dynamic route identifiers before store access", async () => {
    await expect(
      readSessionId({ params: Promise.resolve({ sessionId: "../unbounded-key" }) }),
    ).rejects.toMatchObject({ code: "bad_request", status: 400 });
    await expect(
      readSessionId({
        params: Promise.resolve({ sessionId: `${"A".repeat(21)}B` }),
      }),
    ).rejects.toMatchObject({ code: "bad_request", status: 400 });
  });
});
