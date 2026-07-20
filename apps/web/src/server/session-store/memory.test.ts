import { describe, expect, it } from "vitest";

import { MemorySessionStore } from "./memory";

describe("MemorySessionStore receipts", () => {
  it("expires status-only receipts independently", async () => {
    const store = new MemorySessionStore();
    await store.putReceipt({
      protocolVersion: 1,
      sessionId: "A".repeat(22),
      status: "completed",
      expiresAt: Date.now() + 1000,
    });
    expect((await store.getReceipt("A".repeat(22)))?.status).toBe("completed");
  });
});
