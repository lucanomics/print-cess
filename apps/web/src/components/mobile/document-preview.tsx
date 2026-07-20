"use client";

import { useEffect, useMemo } from "react";

import type { ValidatedMobileFile } from "@/lib/file-validation";
import { PdfPreview } from "./pdf-preview";

export function DocumentPreview({
  file,
  validated,
}: {
  file: File;
  validated: ValidatedMobileFile;
}) {
  const source = useMemo(
    () => (validated.fileKind === "pdf" ? undefined : URL.createObjectURL(file)),
    [file, validated.fileKind],
  );

  useEffect(() => {
    return () => {
      if (source) URL.revokeObjectURL(source);
    };
  }, [source]);

  return (
    <div className="mobile-preview" aria-label="Document preview">
      {validated.fileKind === "pdf" ? (
        <PdfPreview bytes={validated.bytes} />
      ) : source ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={source} alt="Selected document preview" />
      ) : null}
    </div>
  );
}
