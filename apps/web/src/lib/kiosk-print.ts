import type { FileKind } from "@print-cess/protocol";

export type PrintArtifact = {
  url: string;
  filename: string;
  mimeType: string;
  fileKind: FileKind;
};

const PRINT_METADATA: Record<FileKind, { filename: string; mimeType: string }> = {
  pdf: { filename: "print-cess-document.pdf", mimeType: "application/pdf" },
  jpeg: { filename: "print-cess-document.jpg", mimeType: "image/jpeg" },
  png: { filename: "print-cess-document.png", mimeType: "image/png" },
  hwpx: { filename: "print-cess-document.hwpx", mimeType: "application/hwp+zip" },
  hwp: { filename: "print-cess-document.hwp", mimeType: "application/x-hwp" },
};

export function createPrintArtifact(bytes: Uint8Array, fileKind: FileKind): PrintArtifact {
  const metadata = PRINT_METADATA[fileKind];
  const blob = new Blob([Uint8Array.from(bytes).buffer], { type: metadata.mimeType });
  return {
    url: URL.createObjectURL(blob),
    filename: metadata.filename,
    mimeType: metadata.mimeType,
    fileKind,
  };
}

export function revokePrintArtifact(artifact: PrintArtifact | undefined): void {
  if (artifact) URL.revokeObjectURL(artifact.url);
}

export async function printArtifact(artifact: PrintArtifact): Promise<void> {
  if (artifact.fileKind === "hwp" || artifact.fileKind === "hwpx") {
    throw new Error("HWP/HWPX printing requires the configured native Windows kiosk");
  }

  const frame = createPrintFrame();
  document.body.append(frame);

  try {
    if (artifact.fileKind === "pdf") {
      await loadPdf(frame, artifact.url);
    } else {
      await loadImage(frame, artifact.url);
    }

    const printableWindow = frame.contentWindow;
    if (!printableWindow) throw new Error("print frame is unavailable");
    printableWindow.focus();
    printableWindow.print();
  } finally {
    window.setTimeout(() => frame.remove(), 30_000);
  }
}

function createPrintFrame(): HTMLIFrameElement {
  const frame = document.createElement("iframe");
  frame.title = "Print-cess print document";
  frame.setAttribute("aria-hidden", "true");
  Object.assign(frame.style, {
    position: "fixed",
    width: "1px",
    height: "1px",
    inset: "0 auto auto 0",
    border: "0",
    opacity: "0",
    pointerEvents: "none",
  });
  return frame;
}

async function loadPdf(frame: HTMLIFrameElement, url: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(
      () => reject(new Error("PDF print preview timed out")),
      15_000,
    );
    frame.addEventListener(
      "load",
      () => {
        window.clearTimeout(timeout);
        window.setTimeout(resolve, 250);
      },
      { once: true },
    );
    frame.addEventListener(
      "error",
      () => {
        window.clearTimeout(timeout);
        reject(new Error("PDF print preview failed"));
      },
      { once: true },
    );
    frame.src = url;
  });
}

async function loadImage(frame: HTMLIFrameElement, url: string): Promise<void> {
  const printableDocument = frame.contentDocument;
  if (!printableDocument) throw new Error("print document is unavailable");

  printableDocument.head.replaceChildren();
  printableDocument.body.replaceChildren();

  const style = printableDocument.createElement("style");
  const nonce = document.querySelector<HTMLScriptElement>("script[nonce]")?.nonce;
  if (nonce) style.nonce = nonce;
  style.textContent = `
    @page { size: A4; margin: 12mm; }
    html, body { width: 100%; height: 100%; margin: 0; background: white; }
    body { display: grid; place-items: center; }
    img { display: block; max-width: 100%; max-height: 100%; object-fit: contain; }
  `;
  printableDocument.head.append(style);

  const image = printableDocument.createElement("img");
  image.alt = "";
  const loaded = new Promise<void>((resolve, reject) => {
    image.addEventListener("load", () => resolve(), { once: true });
    image.addEventListener("error", () => reject(new Error("image print preview failed")), {
      once: true,
    });
  });
  image.src = url;
  printableDocument.body.append(image);
  await loaded;
  if (typeof image.decode === "function") await image.decode().catch(() => undefined);
}
