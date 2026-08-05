import { MAX_PLAINTEXT_BYTES } from "@print-cess/protocol";

import {
  FileValidationError,
  validateFileForMobile,
  type ValidatedMobileFile,
} from "./file-validation";
import { isHwpSelection, validateHwpHeader } from "./hwp-validation";

export { FileValidationError } from "./file-validation";
export type { ValidatedMobileFile } from "./file-validation";

export async function validateMobileDocument(
  file: File,
  options: { allowHwp?: boolean; allowHwpx?: boolean } = {},
): Promise<ValidatedMobileFile> {
  if (!isHwpSelection(file)) {
    return options.allowHwpx === undefined
      ? validateFileForMobile(file)
      : validateFileForMobile(file, { allowHwpx: options.allowHwpx });
  }

  if (file.size < 1) throw new FileValidationError("damagedFile");
  if (file.size > MAX_PLAINTEXT_BYTES) throw new FileValidationError("tooLarge");
  if (!options.allowHwp) throw new FileValidationError("hwpxUnavailable");

  const bytes = new Uint8Array(await file.arrayBuffer());
  try {
    validateHwpHeader(bytes);
  } catch {
    bytes.fill(0);
    throw new FileValidationError("damagedFile");
  }

  return {
    bytes,
    fileKind: "hwp",
    pageCount: 1,
    normalized: false,
  };
}
