# Cryptography protocol

This document is normative for protocol version 1 of the **print** envelope. Implementations must
reject unknown versions, non-zero reserved fields, unexpected lengths, and envelopes whose total
length is not exact.

The phone-to-phone file hand-off uses a separate scheme with a separate threat model: a
human-readable transfer code stretched with PBKDF2, one AES-GCM key per file, and position-binding
additional data per chunk. It is specified in `FILE_TRANSFER.md` and must not be confused with the
print envelope below — in particular, the hand-off's key material comes from a sixty-bit code
rather than an ECDH exchange, so the two are not interchangeable.

## Primitives and encodings

| Purpose                | Protocol value                                                      |
| ---------------------- | ------------------------------------------------------------------- |
| Key agreement          | ECDH on NIST P-256                                                  |
| Public-key wire format | 65-byte uncompressed SEC1 point: `04` + `X(32)` + `Y(32)`           |
| Fingerprint            | SHA-256 of the exact 65 public-key bytes, base64url without padding |
| KDF                    | HKDF-SHA-256                                                        |
| HKDF salt              | Fresh 32 random bytes per document                                  |
| HKDF info              | UTF-8 bytes of `print-cess-by-paradiso:file:v1`                     |
| AEAD                   | AES-256-GCM                                                         |
| IV                     | Fresh 12 random bytes per document                                  |
| Authentication tag     | 16 bytes (128 bits), appended by Web Crypto after ciphertext        |
| Integer encoding       | Unsigned, network byte order (big-endian)                           |
| Maximum plaintext      | 10,485,760 bytes (10 MiB)                                           |
| Maximum envelope       | 10,485,911 bytes (10 MiB + 151 bytes overhead)                      |

Randomness comes from Web Crypto `crypto.getRandomValues` on the phone and a platform CSPRNG on
Windows. IVs and salts must never be counters, timestamps, session IDs, or reused values.

## Key lifecycle

1. The kiosk generates a fresh P-256 key pair for each displayed session.
2. Only the raw public key and its fingerprint are registered. The private key stays in kiosk
   process memory and is never serialized, logged, sent to the server, or persisted for recovery.
3. The phone checks the fingerprint from the QR fragment before using the server-provided key.
4. The phone generates a fresh ephemeral P-256 key pair for the file.
5. Both sides derive the 256-bit ECDH shared secret and use it as HKDF input keying material.
6. HKDF derives a non-exportable 256-bit AES-GCM key with the envelope salt and fixed info string.
7. After use, implementations overwrite mutable shared-secret/plaintext buffers where possible,
   dispose cryptographic objects, and drop references. JavaScript and .NET garbage collection make
   immediate physical memory erasure a best effort, not a guarantee.
8. A kiosk crash loses the private key by design. The object is deleted by cleanup and must not be
   recovered or printed after restart.

## QR binding

The QR has this form:

```text
https://<public-base-url>/s/<sessionId>#t=<uploadToken>&fp=<kioskPublicKeyFingerprint>
```

`t` and `fp` are fragments, never query parameters. The mobile application requires both, validates
their syntax, removes them from visible browser state after reading, and does not send them to
analytics. The raw 65-byte kiosk public key is fingerprinted locally and the decoded digest is
compared without early exit. A mismatch stops before file access, encryption, or upload.

The upload token is still a short-lived bearer credential: a photograph of an unused QR can win the
first claim. Claim-once, a three-minute deadline, hiding the QR after claim, physical placement, and
rate limits reduce but do not eliminate that risk.

## Binary envelope layout

The complete object is `header || ciphertext || tag`. The fixed header is 26 bytes; variable header
fields make the version-1 header exactly 135 bytes.

|                 Offset |             Size | Field                       | Version-1 value/rule                                    |
| ---------------------: | ---------------: | --------------------------- | ------------------------------------------------------- |
|                      0 |                8 | Magic                       | Hex `50 43 45 4e 56 30 31 00`, ASCII `PCENV01` plus NUL |
|                      8 |                1 | Protocol version            | `01`                                                    |
|                      9 |                1 | File kind                   | `01` PDF, `02` JPEG, `03` PNG                           |
|                     10 |                2 | Flags                       | `0000`; reject every non-zero bit                       |
|                     12 |                2 | Ephemeral public-key length | `0041` (65)                                             |
|                     14 |                1 | Salt length                 | `20` (32)                                               |
|                     15 |                1 | IV length                   | `0c` (12)                                               |
|                     16 |                1 | Tag length                  | `10` (16)                                               |
|                     17 |                1 | Reserved                    | `00`                                                    |
|                     18 |                4 | Plaintext length            | 1 through 10,485,760                                    |
|                     22 |                4 | Ciphertext-and-tag length   | plaintext length + 16                                   |
|                     26 |               65 | Mobile ephemeral public key | Uncompressed SEC1 P-256; first byte `04`                |
|                     91 |               32 | HKDF salt                   | Random                                                  |
|                    123 |               12 | AES-GCM IV                  | Random                                                  |
|                    135 | plaintext length | Ciphertext                  | AES-GCM output excluding trailing tag                   |
| 135 + plaintext length |               16 | Authentication tag          | AES-GCM 128-bit tag                                     |

Parsers calculate lengths with checked arithmetic, enforce the maximum before allocation, and
require:

```text
objectLength == 135 + plaintextLength + 16
ciphertextAndTagLength == plaintextLength + 16
```

The metadata file-kind value is authenticated but is only an expectation. The kiosk still detects
the decrypted file by magic bytes and parser/decoder behavior and rejects any mismatch.

## Additional authenticated data

The AAD is a deterministic byte sequence:

```text
UTF8("print-cess-by-paradiso:aad:v1")
|| u8(protocolVersion)
|| u8(sessionIdUtf8Length)
|| UTF8(sessionId)
|| u8(fingerprintUtf8Length)
|| UTF8(kioskPublicKeyFingerprint)
|| completeEnvelopeHeader[0..134]
```

Session ID and fingerprint UTF-8 lengths must each fit in one byte. The whole 135-byte header is
AAD, so version, kind, lengths, ephemeral public key, salt, and IV are authenticated. The session
and QR fingerprint bind an otherwise valid envelope to the intended kiosk session.

## Encryption

1. Validate the plaintext byte length and expected file kind.
2. Generate the mobile key pair, 32-byte salt, and 12-byte IV.
3. Derive the 32-byte ECDH shared secret against the verified kiosk key.
4. Derive a 256-bit AES key with HKDF-SHA-256, the random salt, and fixed info.
5. Encode the exact header and AAD.
6. Encrypt with AES-256-GCM and a 128-bit tag.
7. Assemble the header and Web Crypto's `ciphertext || tag` without base64 or JSON conversion.
8. Best-effort clear the shared-secret buffer and release file/key references.

## Decryption

1. Reject an oversized or truncated object before large allocation.
2. Parse and strictly validate the header and exact total length.
3. Import the mobile public key and reject malformed/non-curve points.
4. Derive ECDH/HKDF using the kiosk private key and header salt.
5. Rebuild AAD from the trusted session context and exact header bytes.
6. Authenticate and decrypt AES-GCM in one operation. On any error, expose only a neutral failure.
7. Confirm authenticated plaintext length and then run independent file validation.
8. Never parse or print bytes whose GCM authentication failed.

## Interoperability and negative tests

TypeScript and C# must consume the same immutable, synthetic vector at
`packages/test-fixtures/vectors/protocol-v1.json`, containing:

- kiosk/mobile private scalars and public keys, plus the kiosk fingerprint;
- salt, IV, session ID, PDF file-kind code, and synthetic protocol plaintext;
- exact header, derived AES key, ciphertext, tag, and SHA-256 of the complete envelope.

Both implementations reconstruct the ECDH shared secret and AAD from those fixed inputs. Acceptance
requires byte-for-byte equality, not merely successful decryption. Each implementation must also
reject a one-byte change to the fixed header, mobile key, salt, IV, ciphertext, or tag; wrong
session ID; wrong kiosk fingerprint; wrong kiosk key; invalid SEC1 prefix; non-zero flags or
reserved byte; length overflow/truncation/trailing bytes; and unsupported protocol/file-kind codes.

The vector description states that its weak private scalars are deterministic test-only values and
must never be used in Production. It contains no real person, booking, travel, passport, or
immigration data.

## Residual cryptographic risks

- The server supplies the mobile JavaScript. A malicious or compromised deployment can copy the
  plaintext before encryption; E2EE protects storage and ordinary server access, not hostile client
  code delivery.
- QR capture before claim permits session theft or denial of service.
- Kiosk malware, a local administrator, debugger, crash dump, page file, parser, print driver, or
  spooler can observe plaintext after decryption.
- Managed runtimes cannot promise deterministic memory erasure.
- P-256 and AES-GCM are not post-quantum. The three-minute ciphertext lifetime substantially narrows
  retention but does not make the construction post-quantum secure.
- Clock skew can shorten or accidentally broaden provider URL usability unless NTP and server-side
  expiry checks are monitored.

Protocol changes require a new version, updated HKDF/AAD domain strings as appropriate, fresh
cross-language vectors, and rejection rather than silent fallback when peers disagree.
