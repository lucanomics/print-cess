// Canonical unpadded base64url has constrained trailing characters when the
// encoded byte length is not divisible by three. These expressions reject
// alternate encodings that decode to the same bytes.
export const SESSION_ID_PATTERN = /^[A-Za-z0-9_-]{21}[AQgw]$/u;
export const DIGEST_PATTERN = /^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/u;
export const P256_PUBLIC_KEY_PATTERN = /^B[A-P][A-Za-z0-9_-]{84}[AEIMQUYcgkosw048]$/u;
export const ENCRYPTED_BLOB_PATH_PATTERN = /^v1\/[A-Za-z0-9_-]{21}[AQgw]\.bin$/u;
