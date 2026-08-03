"use client";

import { useEffect, useMemo } from "react";

import type { ValidatedMobileFile } from "@/lib/file-validation";
import { PdfPreview } from "./pdf-preview";

export function DocumentPreview({
  file,
  validated,
  labels,
}: {
  file: File;
  validated: ValidatedMobileFile;
  labels: {
    documentPreview: string;
    selectedDocumentPreview: string;
    pdfPreview: string;
    firstPagePreview: string;
  };
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
    <div className="mobile-preview" aria-label={labels.documentPreview}>
      {validated.fileKind === "pdf" ? (
        <PdfPreview
          bytes={validated.bytes}
          pdfPreview={labels.pdfPreview}
          firstPagePreview={labels.firstPagePreview}
        />
      ) : source ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={source} alt={labels.selectedDocumentPreview} />
      ) : null}
    </div>
  );
}
