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
  const source = useMemo(() => {
    if (validated.fileKind === "pdf") return undefined;
    const previewBlob = validated.normalized
      ? new Blob([validated.bytes.slice().buffer], {
          type: validated.fileKind === "png" ? "image/png" : "image/jpeg",
        })
      : file;
    return URL.createObjectURL(previewBlob);
  }, [file, validated.bytes, validated.fileKind, validated.normalized]);

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
