// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import {
  createPrintArtifact,
  printArtifact,
  revokePrintArtifact,
  type PrintArtifact,
} from "@/lib/kiosk-print";

describe("browser kiosk printing", () => {
  const createObjectURL = vi.fn(() => "blob:print-cess-test");
  const revokeObjectURL = vi.fn();

  beforeEach(() => {
    createObjectURL.mockClear();
    revokeObjectURL.mockClear();
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revokeObjectURL });
  });

  afterEach(() => {
    document.body.replaceChildren();
    vi.useRealTimers();
  });

  test.each([
    ["pdf", "application/pdf", "print-cess-document.pdf"],
    ["jpeg", "image/jpeg", "print-cess-document.jpg"],
    ["png", "image/png", "print-cess-document.png"],
  ] as const)("creates and revokes a %s download", (fileKind, mimeType, filename) => {
    const artifact = createPrintArtifact(new Uint8Array([1, 2, 3]), fileKind);

    expect(artifact).toEqual({
      url: "blob:print-cess-test",
      filename,
      mimeType,
      fileKind,
    });
    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(createObjectURL.mock.calls[0]?.[0]).toBeInstanceOf(Blob);

    revokePrintArtifact(artifact);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:print-cess-test");
  });

  test("prints an image from an isolated A4 frame", async () => {
    vi.useFakeTimers();
    const artifact: PrintArtifact = {
      url: "blob:print-cess-image",
      filename: "print-cess-document.png",
      mimeType: "image/png",
      fileKind: "png",
    };

    const pending = printArtifact(artifact);
    const frame = document.querySelector("iframe");
    const printableWindow = frame?.contentWindow;
    const image = frame?.contentDocument?.querySelector("img");
    expect(frame).toBeInstanceOf(HTMLIFrameElement);
    expect(image?.src).toBe("blob:print-cess-image");
    expect(frame?.contentDocument?.querySelector("style")?.textContent).toContain("@page");

    const focus = vi.fn();
    const print = vi.fn();
    Object.defineProperty(printableWindow, "focus", { configurable: true, value: focus });
    Object.defineProperty(printableWindow, "print", { configurable: true, value: print });
    image?.dispatchEvent(new Event("load"));
    await pending;

    expect(focus).toHaveBeenCalledOnce();
    expect(print).toHaveBeenCalledOnce();
    await vi.runAllTimersAsync();
    expect(document.querySelector("iframe")).toBeNull();
  });
});
