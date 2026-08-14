import { DropTransferError } from "@/lib/drop-transfer";

/**
 * Several failures need the same sentence on screen: a visitor does not care
 * whether a file was missing, unreadable, or changed underneath the picker —
 * the fix is to choose it again. Only distinctions that lead to a different
 * next action get their own message.
 */
const SHARED_MESSAGES: Record<string, string> = {
  dropEmptyFile: "dropFileUnreadable",
  dropFileMissing: "dropFileUnreadable",
  dropFileChanged: "dropFileUnreadable",
  dropUploadFailed: "dropNetworkError",
  dropDownloadFailed: "dropNetworkError",
};

const KNOWN_KEYS = new Set([
  "dropNoFiles",
  "dropTooManyFiles",
  "dropTooLarge",
  "dropFileUnreadable",
  "dropNetworkError",
  "dropCodeNotFound",
  "dropExpired",
  "dropTooManyTries",
  "dropDamaged",
  "dropCancelled",
]);

export function dropErrorKey(error: unknown): string {
  if (!(error instanceof DropTransferError)) return "dropNetworkError";
  const key = SHARED_MESSAGES[error.code] ?? error.code;
  return KNOWN_KEYS.has(key) ? key : "dropNetworkError";
}
