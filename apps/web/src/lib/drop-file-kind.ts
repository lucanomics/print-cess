import { splitExtension } from "./drop-file-name";

/**
 * A safe, generic description of what a file is.
 *
 * Everything here is derived from the extension and the declared media type,
 * and nothing opens, parses, or decodes the file to find out more. That
 * restraint is the point: a hand-off service that peers inside an arbitrary
 * file to choose an icon has quietly become a parser of every format anyone
 * sends it, and each parser is a way in. Bytes stay opaque.
 *
 * The label is also what the public kiosk is allowed to show. It names a
 * category and never the file: `PDF`, not `2026 payslip.pdf`.
 */
export type DropFileKind =
  | "pdf"
  | "image"
  | "video"
  | "audio"
  | "archive"
  | "document"
  | "sheet"
  | "slides"
  | "text"
  | "hancom"
  | "file";

const BY_EXTENSION: Record<string, DropFileKind> = {
  pdf: "pdf",

  jpg: "image",
  jpeg: "image",
  png: "image",
  gif: "image",
  webp: "image",
  heic: "image",
  heif: "image",
  avif: "image",
  bmp: "image",
  tif: "image",
  tiff: "image",
  svg: "image",

  mp4: "video",
  mov: "video",
  webm: "video",
  mkv: "video",
  avi: "video",
  m4v: "video",

  mp3: "audio",
  m4a: "audio",
  aac: "audio",
  wav: "audio",
  flac: "audio",
  ogg: "audio",
  opus: "audio",

  zip: "archive",
  "7z": "archive",
  rar: "archive",
  tar: "archive",
  gz: "archive",
  tgz: "archive",
  bz2: "archive",

  doc: "document",
  docx: "document",
  odt: "document",
  rtf: "document",
  pages: "document",

  xls: "sheet",
  xlsx: "sheet",
  ods: "sheet",
  csv: "sheet",
  tsv: "sheet",

  ppt: "slides",
  pptx: "slides",
  odp: "slides",
  key: "slides",

  txt: "text",
  md: "text",
  json: "text",
  xml: "text",
  yaml: "text",
  yml: "text",
  html: "text",
  css: "text",
  js: "text",
  sql: "text",
  log: "text",

  hwp: "hancom",
  hwpx: "hancom",
};

const BY_MEDIA_PREFIX: [string, DropFileKind][] = [
  ["application/pdf", "pdf"],
  ["image/", "image"],
  ["video/", "video"],
  ["audio/", "audio"],
  ["text/", "text"],
];

export function dropFileKind(name: string, mediaType = ""): DropFileKind {
  const { extension } = splitExtension(name);
  const suffix = extension.replace(/^\./u, "").toLowerCase();
  const byExtension = BY_EXTENSION[suffix];
  // The extension wins: phones report an empty media type for exactly the
  // documents this service exists for, and a wrong one often enough that
  // trusting it first would mislabel more than it labels.
  if (byExtension) return byExtension;
  const type = mediaType.toLowerCase();
  for (const [prefix, kind] of BY_MEDIA_PREFIX) {
    if (type.startsWith(prefix)) return kind;
  }
  return "file";
}

/** The translation key for a category name, never a file name. */
export function dropFileKindLabelKey(kind: DropFileKind): string {
  return `fileKind_${kind}`;
}
