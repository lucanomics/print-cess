import { describe, expect, it } from "vitest";

import { DROP_CHUNK_BYTES, MAX_DROP_FILES } from "@print-cess/protocol";

import { DropTransferError, prepareSelection, safeFileName } from "./drop-transfer";

function fakeFile(name: string, size: number): File {
  // Building a real multi-megabyte File would allocate for nothing; only the
  // name, size, and type are read while a selection is prepared.
  return { name, size, type: "application/octet-stream" } as File;
}

describe("prepareSelection", () => {
  it("splits a large file into chunks and lays the parts out end to end", () => {
    const selection = prepareSelection([
      fakeFile("video.mp4", DROP_CHUNK_BYTES * 2 + 1),
      fakeFile("note.txt", 12),
    ]);
    expect(selection.manifestFiles[0]?.chunkCount).toBe(3);
    expect(selection.manifestFiles[1]?.chunkCount).toBe(1);
    expect(selection.partCount).toBe(4);
    expect(selection.totalBytes).toBe(DROP_CHUNK_BYTES * 2 + 13);
  });

  it("refuses an empty selection", () => {
    expect(() => prepareSelection([])).toThrow(DropTransferError);
  });

  it("refuses more files than one transfer carries", () => {
    const files = Array.from({ length: MAX_DROP_FILES + 1 }, (_, index) =>
      fakeFile(`f${index}.txt`, 10),
    );
    expect(() => prepareSelection(files)).toThrow(/dropTooManyFiles/u);
  });

  it("refuses a zero-byte file rather than sending an empty chunk", () => {
    expect(() => prepareSelection([fakeFile("empty.txt", 0)])).toThrow(/dropEmptyFile/u);
  });
});

describe("safeFileName", () => {
  it("keeps an ordinary name unchanged", () => {
    expect(safeFileName("holiday photo.jpg")).toBe("holiday photo.jpg");
  });

  it("strips the separators that would let a name escape its folder", () => {
    expect(safeFileName("../../etc/passwd")).toBe("__.._etc_passwd");
    expect(safeFileName("C:\\Windows\\system32")).toBe("C__Windows_system32");
  });

  it("removes control characters a sending device could smuggle in", () => {
    expect(safeFileName("in\u0000voice\u001b.pdf")).toBe("in_voice_.pdf");
  });

  it("never returns an empty name", () => {
    expect(safeFileName("   ")).toBe("file");
    expect(safeFileName("...")).toBe("_");
  });

  it("bounds a name that would otherwise be unreasonably long", () => {
    expect(safeFileName("a".repeat(500))).toHaveLength(180);
  });
});
