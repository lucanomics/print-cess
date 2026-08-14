import { DROP_CODE_PATTERN, formatDropCode, normalizeDropCode } from "@print-cess/protocol";

const FRAGMENT_KEY = "c=";

/**
 * The transfer code travels in the URL fragment, which browsers never send to a
 * server. Scanning the QR code and typing the twelve characters therefore reach
 * exactly the same place, and neither reveals the key to the service.
 */
export function buildDropLink(origin: string, code: string): string {
  return `${origin}/receive#${FRAGMENT_KEY}${code}`;
}

export function parseDropFragment(hash: string): string | null {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!raw) return null;
  const parameters = new URLSearchParams(raw);
  const candidate = parameters.get("c") ?? raw;
  const code = normalizeDropCode(candidate);
  return DROP_CODE_PATTERN.test(code) ? code : null;
}

export { formatDropCode, normalizeDropCode };
