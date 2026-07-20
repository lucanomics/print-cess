# Protocol schema contract

`print-session.schema.json` is the normative wire/storage schema for protocol version 1. The
TypeScript Zod schema and C# DTO tests must both accept the shared synthetic examples and reject
version, status, identifier-length, and unknown-field mutations. The binary envelope is normative
in `docs/CRYPTOGRAPHY.md` and the shared vector under `packages/test-fixtures/vectors/`.

Changing this schema requires a new protocol version; it must not silently reinterpret active v1
sessions.
