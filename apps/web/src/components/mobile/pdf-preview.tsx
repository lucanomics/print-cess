"use client";

import { useEffect, useRef, useState } from "react";

export function PdfPreview({
  bytes,
  pdfPreview,
  firstPagePreview,
}: {
  bytes: Uint8Array;
  pdfPreview: string;
  firstPagePreview: string;
}) {
  const canvasReference = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
        const task = pdfjs.getDocument({
          data: bytes.slice(),
          stopAtErrors: true,
          enableXfa: false,
          disableAutoFetch: true,
          disableStream: true,
        });
        const document = await task.promise;
        try {
          const page = await document.getPage(1);
          const viewport = page.getViewport({ scale: 1.2 });
          const canvas = canvasReference.current;
          if (!canvas || cancelled) return;
          const scale = Math.min(1.5, 440 / viewport.width);
          const scaled = page.getViewport({ scale: 1.2 * scale });
          canvas.width = Math.ceil(scaled.width);
          canvas.height = Math.ceil(scaled.height);
          const context = canvas.getContext("2d", { alpha: false });
          if (!context) throw new Error("Canvas unavailable");
          context.fillStyle = "white";
          context.fillRect(0, 0, canvas.width, canvas.height);
          await page.render({ canvas, canvasContext: context, viewport: scaled }).promise;
        } finally {
          await document.cleanup();
          await task.destroy();
        }
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bytes]);

  return failed ? (
    <div className="mobile-preview__fallback">{pdfPreview}</div>
  ) : (
    <canvas ref={canvasReference} aria-label={firstPagePreview} />
  );
}
