import { copyFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const source = join(root, "..", "node_modules", "pdfjs-dist", "build", "pdf.worker.min.mjs");
const destination = join(root, "..", "public", "pdf.worker.min.mjs");
await mkdir(dirname(destination), { recursive: true });
await copyFile(source, destination);
