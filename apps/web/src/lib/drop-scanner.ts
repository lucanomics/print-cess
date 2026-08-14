import { DROP_CODE_PATTERN, normalizeDropCode } from "@print-cess/protocol";

import { parseDropFragment } from "./drop-link";

/**
 * Reads a transfer code off the sending phone's screen with the camera.
 *
 * Typing twelve characters is the single largest piece of friction in the
 * hand-off, so scanning is the primary path wherever the browser can do it
 * natively. `BarcodeDetector` is used rather than a bundled decoder: it needs
 * no extra download, and refusing to ship a scanner rather than shipping a
 * heavy one keeps the keypad fallback honest.
 */

type BarcodeDetection = { rawValue: string };
type BarcodeDetectorLike = { detect(source: CanvasImageSource): Promise<BarcodeDetection[]> };
type BarcodeDetectorConstructor = {
  new (options?: { formats?: string[] }): BarcodeDetectorLike;
  getSupportedFormats?: () => Promise<string[]>;
};

function detectorConstructor(): BarcodeDetectorConstructor | null {
  const candidate = (globalThis as { BarcodeDetector?: BarcodeDetectorConstructor })
    .BarcodeDetector;
  return typeof candidate === "function" ? candidate : null;
}

export function supportsCodeScanning(): boolean {
  return (
    detectorConstructor() !== null &&
    typeof navigator !== "undefined" &&
    typeof navigator.mediaDevices?.getUserMedia === "function"
  );
}

export class DropScannerError extends Error {
  public constructor(public readonly code: "cameraRefused" | "scannerUnavailable") {
    super(code);
    this.name = "DropScannerError";
  }
}

export type DropScanner = {
  /** Live camera feed for the preview element. */
  stream: MediaStream;
  /** Resolves with the first transfer code seen, or null once stopped. */
  codes: Promise<string | null>;
  stop(): void;
};

/** How often a frame is inspected. Fast enough to feel instant, cheap enough not to heat a phone. */
const SCAN_INTERVAL_MS = 220;

export async function startDropScanner(video: HTMLVideoElement): Promise<DropScanner> {
  const Detector = detectorConstructor();
  if (!Detector) throw new DropScannerError("scannerUnavailable");

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      // The sending phone is held in front of the receiving one, so the rear
      // camera is the one pointed at the code.
      video: { facingMode: { ideal: "environment" } },
      audio: false,
    });
  } catch {
    throw new DropScannerError("cameraRefused");
  }

  const detector = new Detector({ formats: ["qr_code"] });
  let stopped = false;
  let timer = 0;
  let settle: (code: string | null) => void = () => {};
  const codes = new Promise<string | null>((resolve) => {
    settle = resolve;
  });

  // One settle for both outcomes. Resolving on the way out of `stop` would race
  // the found code to the promise and always win, so the code is passed in.
  const finish = (code: string | null) => {
    if (stopped) return;
    stopped = true;
    window.clearTimeout(timer);
    for (const track of stream.getTracks()) track.stop();
    video.srcObject = null;
    settle(code);
  };
  const stop = () => finish(null);

  video.srcObject = stream;
  video.setAttribute("playsinline", "true");
  video.muted = true;
  await video.play().catch(() => undefined);

  const tick = async () => {
    if (stopped) return;
    try {
      if (video.readyState >= 2) {
        for (const detection of await detector.detect(video)) {
          const code = readTransferCode(detection.rawValue);
          if (code) {
            finish(code);
            return;
          }
        }
      }
    } catch {
      // A frame that cannot be decoded is ordinary; keep looking.
    }
    if (!stopped) timer = window.setTimeout(() => void tick(), SCAN_INTERVAL_MS);
  };
  timer = window.setTimeout(() => void tick(), SCAN_INTERVAL_MS);

  return { stream, codes, stop };
}

/**
 * Accepts either shape a code can arrive in: the full link this service prints
 * into its QR, or a bare code somebody re-encoded by hand.
 */
export function readTransferCode(rawValue: string): string | null {
  try {
    const fromLink = parseDropFragment(new URL(rawValue, "https://placeholder.invalid").hash);
    if (fromLink) return fromLink;
  } catch {
    // Not a URL; fall through to the bare-code reading below.
  }
  const bare = normalizeDropCode(rawValue);
  return DROP_CODE_PATTERN.test(bare) ? bare : null;
}
