import { SaveError } from "@/lib/drop-save";
import { DropTransferError } from "@/lib/drop-transfer";

/**
 * Several failures need the same sentence on screen: a visitor does not care
 * whether a file was missing, unreadable, or changed underneath the picker —
 * the fix is to choose it again. Only distinctions that lead to a different
 * next action get their own message.
 */
const SHARED_MESSAGES: Record<string, string> = {
  dropFileMissing: "dropFileUnreadable",
  dropFileChanged: "dropFileUnreadable",
  dropUploadFailed: "dropNetworkError",
  dropDownloadFailed: "dropNetworkError",
};

const KNOWN_KEYS = new Set([
  "dropNoFiles",
  "dropTooManyFiles",
  "dropTooLarge",
  "dropNamesTooLong",
  "dropFileUnreadable",
  "dropNetworkError",
  "dropCodeNotFound",
  "dropExpired",
  "dropTooManyTries",
  "dropDamaged",
  "dropCancelled",
  // Saving has its own failures, and they lead somewhere different from a
  // transfer failure: a refused folder is a permission to grant, and a file
  // too large for the browser is a transfer to split rather than to retry.
  "dropSaveRefused",
  "dropTooLargeForBrowser",
]);

export function dropErrorKey(error: unknown): string {
  if (error instanceof SaveError) {
    return KNOWN_KEYS.has(error.code) ? error.code : "dropNetworkError";
  }
  if (error instanceof DOMException && error.name === "AbortError") return "dropCancelled";
  if (!(error instanceof DropTransferError)) return "dropNetworkError";
  const key = SHARED_MESSAGES[error.code] ?? error.code;
  return KNOWN_KEYS.has(key) ? key : "dropNetworkError";
}
