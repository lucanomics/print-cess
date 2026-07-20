import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  createBoundaryBytes,
  createDamagedPdf,
  createDisguisedPdf,
  createSyntheticJpeg,
  createSyntheticPdf,
  createSyntheticPng,
} from "../src/index.js";

const outputDirectory = new URL("../generated/", import.meta.url);
await mkdir(outputDirectory, { recursive: true });

const fixtures: Array<[string, Uint8Array | Promise<Uint8Array>]> = [
  ["synthetic-ticket-1-page.pdf", createSyntheticPdf(1)],
  ["synthetic-confirmation-2-pages.pdf", createSyntheticPdf(2)],
  ["synthetic-over-limit-11-pages.pdf", createSyntheticPdf(11)],
  ["synthetic-locked.pdf", createSyntheticPdf(1, "fixture-only-password")],
  ["synthetic-ticket.jpg", createSyntheticJpeg()],
  ["synthetic-ticket.png", createSyntheticPng()],
  ["damaged.pdf", createDamagedPdf()],
  ["disguised.pdf", createDisguisedPdf()],
  ["boundary-10-mib.pdf", createBoundaryBytes()],
  ["over-10-mib.pdf", createBoundaryBytes(1)],
  ["oversized-dimensions.png", createSyntheticPng(13_000, 2)],
];

for (const [name, contents] of fixtures) {
  await writeFile(join(outputDirectory.pathname, name), await contents, { mode: 0o600 });
}

console.log(`Generated ${fixtures.length} synthetic fixtures in ${outputDirectory.pathname}`);
