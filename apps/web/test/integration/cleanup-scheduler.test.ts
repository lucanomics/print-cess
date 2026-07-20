import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const qstash = vi.hoisted(() => ({ publishJSON: vi.fn() }));

vi.mock("@upstash/qstash", () => ({
  Client: class {
    public readonly publishJSON = qstash.publishJSON;
  },
  Receiver: class {},
}));

import { InProcessCleanupScheduler } from "@/server/cleanup/in-process";
import { QStashCleanupScheduler } from "@/server/cleanup/qstash";

describe("cleanup schedulers", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-20T00:00:00.000Z"));
    qstash.publishJSON.mockReset();
    qstash.publishJSON.mockResolvedValue({ messageId: "message-id" });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("deduplicates in-process retries and replaces an obsolete due time", async () => {
    const onDue = vi.fn(async () => undefined);
    const scheduler = new InProcessCleanupScheduler(onDue);
    const now = Date.now();
    const sessionId = "A".repeat(22);

    await scheduler.schedule(sessionId, now + 1_000);
    await scheduler.schedule(sessionId, now + 1_000);
    await scheduler.schedule(sessionId, now + 2_000);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(onDue).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(onDue).toHaveBeenCalledTimes(1);
    expect(onDue).toHaveBeenCalledWith(sessionId);
  });

  it("uses a stable QStash deduplication id for retries at the same due time", async () => {
    const scheduler = new QStashCleanupScheduler(
      "https://example.test/api/cleanup",
      "qstash-token",
    );
    const sessionId = "B".repeat(22);
    const dueAt = Date.now() + 5_000;

    await scheduler.schedule(sessionId, dueAt);
    await scheduler.schedule(sessionId, dueAt);
    await scheduler.schedule(sessionId, dueAt + 1_000);

    const first = qstash.publishJSON.mock.calls[0]?.[0];
    const retry = qstash.publishJSON.mock.calls[1]?.[0];
    const deferred = qstash.publishJSON.mock.calls[2]?.[0];
    expect(first.deduplicationId).toBe(`pc-cleanup-v1-${sessionId}-${dueAt}`);
    expect(retry.deduplicationId).toBe(first.deduplicationId);
    expect(deferred.deduplicationId).not.toBe(first.deduplicationId);
  });
});
