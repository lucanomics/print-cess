import { DIGEST_PATTERN } from "@print-cess/protocol";

export type SessionFragment = {
  uploadToken: string;
  fingerprint: string;
  supportsHwpx: boolean;
  supportsHwp: boolean;
};

export function parseSessionFragment(hash: string): SessionFragment | null {
  if (!hash.startsWith("#")) return null;
  const parameters = new URLSearchParams(hash.slice(1));
  const uploadToken = parameters.get("t");
  const fingerprint = parameters.get("fp");
  if (!uploadToken || !fingerprint) return null;
  if (!DIGEST_PATTERN.test(uploadToken) || !DIGEST_PATTERN.test(fingerprint)) return null;
  // Read independently. Inferring legacy HWP support from HWPX support silently
  // overrode the kiosk's own declaration, so a printer without a legacy
  // renderer would still be offered .hwp files it could not open.
  const supportsHwpx = parameters.get("hwpx") === "1";
  const supportsHwp = parameters.get("hwp") === "1";
  if ([...parameters.keys()].some((key) => !["t", "fp", "hwpx", "hwp"].includes(key))) return null;
  return { uploadToken, fingerprint, supportsHwpx, supportsHwp };
}
