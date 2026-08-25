import { describe, expect, it } from "vitest";

import type { PairingRecord } from "@print-cess/protocol";

import type { RedisScriptClient } from "../session-store/redis-client";
import { RedisPairingStore } from "./redis";

const TRANSFER_CODE = "23456789ABCD";

function draft(now = 1_000): Omit<PairingRecord, "code"> {
  return {
    protocolVersion: 1,
    shape: "star",
    transferCode: TRANSFER_CODE,
    createdAt: now,
    expiresAt: now + 180_000,
  };
}

class FakeRedis implements RedisScriptClient {
  readonly values = new Map<string, string>();
  returnObjects = false;

  async eval(script: string, keys: string[], args: (string | number)[]): Promise<unknown> {
    if (script.includes("'SET'")) {
      for (const [index, key] of keys.entries()) {
        if (this.values.has(key)) continue;
        this.values.set(key, String(args[index + 1]));
        return index + 1;
      }
      return 0;
    }
    const value = this.values.get(keys[0]!);
    if (!value) return false;
    this.values.delete(keys[0]!);
    return this.returnObjects ? JSON.parse(value) : value;
  }

  async get(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  async set(key: string, value: string): Promise<void> {
    this.values.set(key, value);
  }

  async del(key: string): Promise<void> {
    this.values.delete(key);
  }

  async zrangeByScore(): Promise<string[]> {
    return [];
  }

  async zrem(): Promise<void> {}
}

describe("RedisPairingStore", () => {
  it("atomically consumes a live pairing after one wrong shape", async () => {
    const redis = new FakeRedis();
    const store = new RedisPairingStore(redis);
    await store.claim(draft(), ["42"]);

    await expect(store.redeem("42", "circle", 1_000)).rejects.toThrow(
      "Those numbers and that shape do not match a transfer.",
    );
    await expect(store.redeem("42", "star", 1_000)).rejects.toThrow(
      "Those numbers and that shape do not match a transfer.",
    );
  });

  it("accepts the decoded JSON value returned by REST Redis clients", async () => {
    const redis = new FakeRedis();
    redis.returnObjects = true;
    const store = new RedisPairingStore(redis);
    await store.claim(draft(), ["42"]);

    await expect(store.redeem("42", "star", 1_000)).resolves.toMatchObject({
      transferCode: TRANSFER_CODE,
    });
  });
});
