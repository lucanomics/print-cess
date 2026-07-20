import PDFDocument from "pdfkit";
import sharp from "sharp";

export const SYNTHETIC_NOTICE = "SAMPLE — NOT VALID";
export const TEN_MIB = 10 * 1024 * 1024;

export async function createSyntheticPdf(pageCount = 1, password?: string): Promise<Uint8Array> {
  if (!Number.isInteger(pageCount) || pageCount < 1 || pageCount > 20)
    throw new Error("Invalid page count");
  const document = new PDFDocument({
    autoFirstPage: false,
    size: "A4",
    margin: 54,
    ...(password ? { userPassword: password, ownerPassword: `${password}-owner` } : {}),
  });
  const chunks: Buffer[] = [];
  document.on("data", (chunk: Buffer) => chunks.push(chunk));
  const completion = new Promise<Uint8Array>((resolve, reject) => {
    document.on("end", () => resolve(new Uint8Array(Buffer.concat(chunks))));
    document.on("error", reject);
  });
  for (let page = 1; page <= pageCount; page += 1) {
    document.addPage();
    document.fontSize(24).fillColor("#071737").text("Print-cess by Paradiso", { align: "center" });
    document.moveDown(1.5).fontSize(32).text(SYNTHETIC_NOTICE, { align: "center" });
    document
      .moveDown()
      .fontSize(18)
      .fillColor("#23314c")
      .text(`Synthetic travel document · Page ${page} of ${pageCount}`, { align: "center" });
    document.moveDown(2).fontSize(14).text("Route: TEST ORIGIN → TEST DESTINATION");
    document.text("Reference: DEMO-ONLY-0000");
    document.text("This fixture contains no real personal or travel information.");
  }
  document.end();
  return completion;
}

export async function createSyntheticPng(width = 1170, height = 1654): Promise<Uint8Array> {
  const image = await sharp({
    create: { width, height, channels: 3, background: "#ffffff" },
  })
    .composite([
      {
        input: Buffer.from(
          `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><text x="50%" y="45%" text-anchor="middle" font-family="Arial" font-size="64" fill="#071737">SAMPLE — NOT VALID</text><text x="50%" y="52%" text-anchor="middle" font-family="Arial" font-size="30" fill="#008a8a">Synthetic fixture · no personal data</text></svg>`,
        ),
      },
    ])
    .png()
    .toBuffer();
  return new Uint8Array(image);
}

export async function createSyntheticJpeg(width = 1170, height = 1654): Promise<Uint8Array> {
  const png = await createSyntheticPng(width, height);
  return new Uint8Array(await sharp(png).jpeg({ quality: 88 }).toBuffer());
}

export function createBoundaryBytes(overBy = 0): Uint8Array {
  const bytes = new Uint8Array(TEN_MIB + overBy);
  bytes.set(new TextEncoder().encode("%PDF-SAMPLE-NOT-VALID\n"));
  return bytes;
}

export function createDisguisedPdf(): Uint8Array {
  return new TextEncoder().encode("MZ This executable-like content only has a .pdf filename");
}

export function createDamagedPdf(): Uint8Array {
  return new TextEncoder().encode("%PDF-1.7\n1 0 obj << broken and intentionally truncated");
}
