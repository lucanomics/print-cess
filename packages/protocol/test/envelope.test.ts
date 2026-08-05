import { describe, expect, it } from "vitest";

import {
  AES_GCM_TAG_BYTES,
  EnvelopeError,
  assembleEnvelope,
  buildAad,
  encodeEnvelopeHeader,
  parseEnvelope,
} from "../src/index.js";

function metadata() {
  const publicKey = new Uint8Array(65);
  publicKey[0] = 4;
  return {
    protocolVersion: 1 as const,
    fileKind: "pdf" as const,
    plaintextLength: 4,
    ephemeralPublicKey: publicKey,
    salt: new Uint8Array(32).fill(1),
    iv: new Uint8Array(12).fill(2),
  };
}

describe("binary envelope", () => {
  it("round-trips a strictly sized envelope", () => {
    const header = encodeEnvelopeHeader(metadata());
    const envelope = assembleEnvelope(header, new Uint8Array(4 + AES_GCM_TAG_BYTES).fill(3));
    const parsed = parseEnvelope(envelope);
    expect(parsed.fileKind).toBe("pdf");
    expect(parsed.plaintextLength).toBe(4);
    expect(parsed.header).toEqual(header);
  });

  it.each(["hwpx", "hwp"] as const)("round-trips the %s file-kind code", (fileKind) => {
    const value = { ...metadata(), fileKind };
    const header = encodeEnvelopeHeader(value);
    const envelope = assembleEnvelope(header, new Uint8Array(4 + AES_GCM_TAG_BYTES));
    expect(parseEnvelope(envelope).fileKind).toBe(fileKind);
  });

  it("rejects a changed protocol version", () => {
    const header = encodeEnvelopeHeader(metadata());
    const envelope = assembleEnvelope(header, new Uint8Array(4 + AES_GCM_TAG_BYTES));
    envelope[8] = 2;
    expect(() => parseEnvelope(envelope)).toThrow(EnvelopeError);
  });

  it("binds the full header and context into AAD", () => {
    const header = encodeEnvelopeHeader(metadata());
    const context = {
      protocolVersion: 1 as const,
      sessionId: "ABEiM0RVZneImaq7zN3u_w",
      kioskPublicKeyFingerprint: "aYvqY9xEo0RmP_FCmuoQhC3ye2uZHvJYZrLGwCzcxb4",
    };
    const first = buildAad(context, header);
    const changed = header.slice();
    changed[9] = 2;
    expect(buildAad(context, changed)).not.toEqual(first);
  });
});
