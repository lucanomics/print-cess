import { beforeEach, describe, expect, it, vi } from "vitest";

const receiverMock = vi.hoisted(() => ({ verify: vi.fn() }));

vi.mock("@upstash/qstash", () => ({
  Client: class {
    publishJSON = vi.fn();
  },
  Receiver: class {
    verify = receiverMock.verify;
  },
}));

import { verifyQStashRequest } from "./qstash";

const CURRENT_KEY = "current-signing-key".padEnd(40, "c");
const NEXT_KEY = "next-signing-key".padEnd(40, "n");

beforeEach(() => {
  vi.stubEnv("QSTASH_CURRENT_SIGNING_KEY", CURRENT_KEY);
  vi.stubEnv("QSTASH_NEXT_SIGNING_KEY", NEXT_KEY);
  receiverMock.verify.mockReset();
});

describe("QStash cleanup verification", () => {
  it("verifies against the canonical callback rather than a deployment alias", async () => {
    receiverMock.verify.mockResolvedValue(true);
    const request = new Request("https://branch-alias.vercel.app/api/cleanup", {
      method: "POST",
      headers: { "upstash-signature": "signed-value" },
      body: '{"sweep":true}',
    });

    await expect(
      verifyQStashRequest(request, '{"sweep":true}', "https://print-cess.vercel.app/api/cleanup"),
    ).resolves.toBe(true);
    expect(receiverMock.verify).toHaveBeenCalledWith({
      signature: "signed-value",
      body: '{"sweep":true}',
      url: "https://print-cess.vercel.app/api/cleanup",
    });
  });

  it("fails closed instead of turning an invalid signature into a 503", async () => {
    receiverMock.verify.mockRejectedValue(new Error("signature mismatch"));
    const request = new Request("https://print-cess.vercel.app/api/cleanup", {
      method: "POST",
      headers: { "upstash-signature": "bad-value" },
      body: '{"sweep":true}',
    });

    await expect(verifyQStashRequest(request, '{"sweep":true}')).resolves.toBe(false);
  });
});
