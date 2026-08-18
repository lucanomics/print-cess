"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  Download,
  FileCheck2,
  Languages,
  LockKeyhole,
  Printer,
  ShieldCheck,
  Smartphone,
} from "lucide-react";
import QRCode from "qrcode";

import {
  decryptDocument,
  exportPublicKeyBase64Url,
  fingerprintPublicKey,
  generateEcdhKeyPair,
  generateToken,
  hashToken,
} from "@print-cess/crypto";
import {
  MAX_PRINT_BUNDLE_FILES,
  parsePrintBundle,
  type PrintableFileKind,
} from "@print-cess/protocol";
import { Wordmark } from "@print-cess/ui";

import {
  detectFileKind,
  parseJpegDimensions,
  parsePngDimensions,
  validateDimensions,
  validatePdf,
} from "@/lib/file-validation";
import {
  createPrintArtifact,
  printArtifact,
  revokePrintArtifact,
  type PrintArtifact,
} from "@/lib/kiosk-print";

type KioskStatus =
  | "preparing"
  | "waiting"
  | "claimed"
  | "uploading"
  | "uploaded"
  | "validating"
  | "printing"
  | "completed"
  | "failed";

type RegisteredSession = {
  sessionId: string;
  expiresAt: number;
  kioskToken: string;
  qrUrl: string;
  qrImage: string;
  privateKey: CryptoKey;
  fingerprint: string;
};

export function BatchKioskSimulator({
  automaticPrinting = false,
  sound = true,
}: {
  automaticPrinting?: boolean;
  sound?: boolean;
}) {
  const [session, setSession] = useState<RegisteredSession>();
  const [status, setStatus] = useState<KioskStatus>("preparing");
  const [remaining, setRemaining] = useState(120);
  const [completionRemaining, setCompletionRemaining] = useState(60);
  const [artifacts, setArtifacts] = useState<PrintArtifact[]>([]);
  const [generation, setGeneration] = useState(0);
  const processing = useRef(false);
  const artifactsRef = useRef<PrintArtifact[]>([]);

  const replaceArtifacts = useCallback((next: PrintArtifact[]) => {
    for (const artifact of artifactsRef.current) revokePrintArtifact(artifact);
    artifactsRef.current = next;
    setArtifacts(next);
  }, []);

  const reset = useCallback(() => {
    processing.current = false;
    replaceArtifacts([]);
    setSession(undefined);
    setStatus("preparing");
    setRemaining(120);
    setCompletionRemaining(60);
    setGeneration((value) => value + 1);
  }, [replaceArtifacts]);

  useEffect(
    () => () => {
      for (const artifact of artifactsRef.current) revokePrintArtifact(artifact);
      artifactsRef.current = [];
    },
    [],
  );

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const keyPair = await generateEcdhKeyPair();
        const kioskPublicKey = await exportPublicKeyBase64Url(keyPair.publicKey);
        const fingerprint = await fingerprintPublicKey(kioskPublicKey);
        const response = await fetch("/api/kiosk/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            protocolVersion: 1,
            kioskPublicKey,
            kioskPublicKeyFingerprint: fingerprint,
          }),
        });
        if (!response.ok) throw new Error("session registration failed");
        const body = (await response.json()) as {
          sessionId: string;
          expiresAt: number;
          kioskToken: string;
          qrUrl: string;
        };
        const qrImage = await QRCode.toDataURL(body.qrUrl, {
          errorCorrectionLevel: "M",
          margin: 2,
          scale: 11,
          color: { dark: "#071737", light: "#ffffff" },
        });
        if (!active) return;
        setRemaining(Math.max(0, Math.ceil((body.expiresAt - Date.now()) / 1000)));
        setSession({ ...body, qrImage, privateKey: keyPair.privateKey, fingerprint });
        setStatus("waiting");
      } catch {
        if (active) setStatus("failed");
      }
    })();
    return () => {
      active = false;
    };
  }, [generation]);

  useEffect(() => {
    if (!session) return;
    const timer = window.setInterval(() => {
      const seconds = Math.max(0, Math.ceil((session.expiresAt - Date.now()) / 1000));
      setRemaining(seconds);
      if (seconds === 0 && !processing.current) reset();
    }, 500);
    return () => window.clearInterval(timer);
  }, [reset, session]);

  useEffect(() => {
    if (!session || status === "completed" || status === "failed") return;
    let active = true;
    const poll = window.setInterval(() => {
      void (async () => {
        try {
          const response = await fetch(`/api/sessions/${session.sessionId}/status`, {
            headers: { "x-print-cess-kiosk-token": session.kioskToken },
            cache: "no-store",
          });
          if (!response.ok) return;
          const body = (await response.json()) as { status: string; expiresAt?: number };
          if (!active) return;
          if (body.status === "expired" || body.status === "cancelled") {
            reset();
            return;
          }
          if (body.status === "failed") {
            setStatus("failed");
            return;
          }
          if (typeof body.expiresAt === "number" && Number.isFinite(body.expiresAt)) {
            setSession((current) =>
              current && current.sessionId === session.sessionId
                ? { ...current, expiresAt: body.expiresAt as number }
                : current,
            );
          }
          if (body.status === "claimed") setStatus("claimed");
          if (body.status === "upload_authorized" || body.status === "uploading") setStatus("uploading");
          if (body.status === "uploaded" && !processing.current) {
            processing.current = true;
            setStatus("uploaded");
            await consumeValidateAndPrint(session, setStatus, replaceArtifacts);
            if (active && sound) playCompletionTone();
          }
        } catch {
          // A transient status read does not rewrite the kiosk's known state.
        }
      })();
    }, 750);
    return () => {
      active = false;
      window.clearInterval(poll);
    };
  }, [replaceArtifacts, reset, session, sound, status]);

  useEffect(() => {
    if (status !== "completed") return;
    const deadline = Date.now() + 60_000;
    const interval = window.setInterval(
      () => setCompletionRemaining(Math.max(0, Math.ceil((deadline - Date.now()) / 1000))),
      250,
    );
    const timeout = window.setTimeout(reset, 60_000);
    return () => {
      window.clearInterval(interval);
      window.clearTimeout(timeout);
    };
  }, [reset, status]);

  if (status === "completed" && artifacts.length > 0) {
    return (
      <CompletedScreen
        artifacts={artifacts}
        automaticPrinting={automaticPrinting}
        remaining={completionRemaining}
      />
    );
  }
  if (status === "failed") return <UnavailableScreen onReset={reset} />;
  if (status !== "preparing" && status !== "waiting") {
    return <ConnectedScreen status={status} remaining={remaining} />;
  }

  return (
    <main className="kiosk-shell" lang="ko">
      <Wordmark />
      <div className="kiosk-layout">
        <section className="kiosk-instructions">
          <h1 className="kiosk-step-heading">
            <span className="kiosk-step-number" aria-hidden="true">1</span>
            <span className="kiosk-step-heading__text">
              <span>휴대전화에서</span><span>카메라를 여세요</span>
            </span>
          </h1>
          <p className="kiosk-english" lang="en">Open the camera on your phone</p>
          <p className="kiosk-spotlight">
            <span>여러 파일 가능</span> 사진과 문서를 최대 {MAX_PRINT_BUNDLE_FILES}개까지 한 번에 출력할 수 있어요
          </p>
          <div className="kiosk-facts">
            <p><FileCheck2 aria-hidden="true" /><span>인쇄할 수 있는 파일<br /><strong>PDF · JPG/JPEG · HEIC 등 사진</strong></span></p>
            <p><LockKeyhole aria-hidden="true" /><span>인쇄가 끝나면<br /><strong>업로드 파일 자동 삭제</strong></span></p>
          </div>
          <div className="kiosk-status-row" aria-live="polite">
            <span className="kiosk-status-dot"><CheckCircle2 aria-hidden="true" /></span>
            <strong>{statusLabel(status)}</strong>
            <span className="kiosk-countdown">QR코드 변경까지 <b>{formatTime(remaining)}</b></span>
          </div>
        </section>
        <section
          className="kiosk-qr"
          aria-label="휴대전화로 스캔할 QR코드"
          data-session-url={process.env.NODE_ENV === "production" ? undefined : session?.qrUrl}
        >
          <div className="kiosk-qr__instruction">
            <span className="kiosk-step-number" aria-hidden="true">2</span>
            <div><strong>QR코드를 카메라로 비추세요</strong><small>Point your camera at the QR code</small></div>
          </div>
          {session ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={session.qrImage} alt="휴대전화로 스캔할 Print-cess 보안 QR코드" />
          ) : <div className="kiosk-qr__loading" aria-busy="true" />}
          <div className="kiosk-qr__action">
            <span className="kiosk-step-number" aria-hidden="true">3</span>
            <Smartphone aria-hidden="true" />
            <div><strong>파일을 하나 또는 여러 개 선택하세요</strong><small>Select one or multiple files, then print them together</small></div>
          </div>
          <p className="kiosk-languages"><Languages aria-hidden="true" /><span>다국어 지원 · languages</span></p>
        </section>
      </div>
    </main>
  );
}

async function consumeValidateAndPrint(
  session: RegisteredSession,
  setStatus: (status: KioskStatus) => void,
  setArtifacts: (artifacts: PrintArtifact[]) => void,
) {
  let envelope = new Uint8Array();
  let plaintext = new Uint8Array();
  let bundleItems: ReturnType<typeof parsePrintBundle> = [];
  try {
    const consumeResponse = await fetch(`/api/sessions/${session.sessionId}/consume`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-print-cess-kiosk-token": session.kioskToken },
      body: JSON.stringify({ consumeIdHash: await hashToken(generateToken(), "kiosk") }),
    });
    if (!consumeResponse.ok) throw new Error("consume failed");
    const operation = (await consumeResponse.json()) as {
      url: string;
      headers: Record<string, string>;
      size: number;
      etag: string;
    };
    const download = await fetch(operation.url, {
      method: "GET",
      headers: operation.headers,
      cache: "no-store",
    });
    if (!download.ok) throw new Error("download failed");
    envelope = new Uint8Array(await download.arrayBuffer());
    if (envelope.byteLength !== operation.size) throw new Error("metadata mismatch");
    const decrypted = await decryptDocument(
      envelope,
      {
        protocolVersion: 1,
        sessionId: session.sessionId,
        kioskPublicKeyFingerprint: session.fingerprint,
      },
      session.privateKey,
    );
    plaintext = decrypted.plaintext;
    setStatus("validating");
    await kioskTransition(session, "validating");

    const items = decrypted.fileKind === "bundle"
      ? (bundleItems = parsePrintBundle(plaintext))
      : [{ fileKind: printableKind(decrypted.fileKind), bytes: plaintext }];

    const nextArtifacts: PrintArtifact[] = [];
    try {
      for (const item of items) {
        await validateBrowserPrintable(item.bytes, item.fileKind);
        nextArtifacts.push(createPrintArtifact(item.bytes, item.fileKind));
      }
    } catch (error) {
      for (const artifact of nextArtifacts) revokePrintArtifact(artifact);
      throw error;
    }

    setArtifacts(nextArtifacts);
    setStatus("printing");
    await kioskTransition(session, "printing");
    // `window.print()` blocks until its dialog is dismissed in the supported
    // desktop browsers, so this naturally walks the selected documents in order.
    for (const artifact of nextArtifacts) await printArtifact(artifact).catch(() => undefined);
    await kioskTransition(session, "completed");
    setStatus("completed");
  } catch {
    setStatus("failed");
    await kioskTransition(session, "failed").catch(() => undefined);
  } finally {
    envelope.fill(0);
    plaintext.fill(0);
    for (const item of bundleItems) item.bytes.fill(0);
  }
}

async function validateBrowserPrintable(bytes: Uint8Array, expectedKind: PrintableFileKind) {
  if (expectedKind === "hwp" || expectedKind === "hwpx") {
    throw new Error("Hancom files require the native Windows kiosk");
  }
  const detected = detectFileKind(bytes);
  if (detected !== expectedKind) throw new Error("file kind mismatch");
  if (detected === "pdf") await validatePdf(bytes);
  else if (detected === "png" || detected === "jpeg") {
    const { width, height } = detected === "png" ? parsePngDimensions(bytes) : parseJpegDimensions(bytes);
    validateDimensions(width, height);
  } else throw new Error("unsupported browser print kind");
}

function printableKind(kind: string): PrintableFileKind {
  if (kind === "pdf" || kind === "jpeg" || kind === "png" || kind === "hwp" || kind === "hwpx") return kind;
  throw new Error("outer print kind is not printable");
}

async function kioskTransition(
  session: RegisteredSession,
  status: "validating" | "printing" | "completed" | "failed",
) {
  const response = await fetch(`/api/sessions/${session.sessionId}/transition`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-print-cess-kiosk-token": session.kioskToken },
    body: JSON.stringify({ status }),
  });
  if (!response.ok) throw new Error(`transition ${status} failed`);
}

function ConnectedScreen({ status, remaining }: { status: KioskStatus; remaining: number }) {
  return (
    <main className="kiosk-shell kiosk-shell--connected" lang="ko" data-kiosk-state="connected">
      <Wordmark />
      <div className="kiosk-connected">
        <p className="kiosk-connected__badge"><Smartphone aria-hidden="true" /> 휴대전화가 연결됐어요<small lang="en">Phone connected</small></p>
        <h1 className="kiosk-connected__headline">
          {status === "printing" ? "선택한 파일을 인쇄하고 있어요" : "휴대전화에서 계속하세요"}
          <small lang="en">{status === "printing" ? "Printing your selected files" : "Continue on your phone"}</small>
        </h1>
        <div className={`kiosk-token kiosk-token--${status}`} aria-hidden="true" data-testid="kiosk-document-token"><Files /></div>
        <div className="kiosk-status-row" aria-live="polite">
          <span className="kiosk-status-dot"><CheckCircle2 aria-hidden="true" /></span>
          <strong>{statusLabel(status)}</strong>
          <span className="kiosk-countdown">작업 만료까지 <b>{formatTime(remaining)}</b></span>
        </div>
      </div>
    </main>
  );
}

function CompletedScreen({
  artifacts,
  automaticPrinting,
  remaining,
}: {
  artifacts: PrintArtifact[];
  automaticPrinting: boolean;
  remaining: number;
}) {
  return (
    <main className="kiosk-result kiosk-result--success" lang="ko" data-printing-mode={automaticPrinting ? "automatic" : "interactive"}>
      <Wordmark />
      <CheckCircle2 aria-hidden="true" />
      <h1>{automaticPrinting ? "인쇄가 시작됐어요" : "인쇄 준비가 끝났어요"}</h1>
      <p><Printer aria-hidden="true" /> 선택한 파일 {artifacts.length}개를 처리했습니다</p>
      <p className="kiosk-result__english" lang="en">Processed {artifacts.length} selected file{artifacts.length === 1 ? "" : "s"}.</p>
      <div className="kiosk-result__actions">
        {automaticPrinting ? null : (
          <button type="button" onClick={() => void printAll(artifacts)}><Printer aria-hidden="true" /> 인쇄 창 다시 열기</button>
        )}
        {artifacts.map((artifact, index) => (
          <a key={artifact.url} href={artifact.url} download={`print-cess-${index + 1}-${artifact.filename}`} className="kiosk-download">
            <Download aria-hidden="true" /> 파일 {index + 1} 다운로드 (직원용)
          </a>
        ))}
      </div>
      <span>서버에 보관된 파일은 삭제됐습니다 · {remaining}초 후 새 QR코드</span>
    </main>
  );
}

async function printAll(artifacts: readonly PrintArtifact[]) {
  for (const artifact of artifacts) await printArtifact(artifact).catch(() => undefined);
}

function UnavailableScreen({ onReset }: { onReset: () => void }) {
  return (
    <main className="kiosk-result kiosk-result--error" lang="ko">
      <Wordmark /><ShieldCheck aria-hidden="true" />
      <h1>지금은 인쇄할 수 없어요</h1>
      <p>잠시 뒤에 다시 시도해 주세요.</p>
      <p className="kiosk-result__english" lang="en">Printing is unavailable right now. Please try again in a moment.</p>
      <span>보내신 파일은 삭제됐습니다.</span>
      <button type="button" onClick={onReset}>새 QR코드 만들기</button>
    </main>
  );
}

function statusLabel(status: KioskStatus): string {
  return {
    preparing: "준비 중",
    waiting: "사용할 수 있어요",
    claimed: "휴대전화가 연결됐어요",
    uploading: "파일을 받고 있어요",
    uploaded: "파일을 받았어요",
    validating: "파일을 확인하고 있어요",
    printing: "인쇄하고 있어요",
    completed: "인쇄가 끝났어요",
    failed: "잠시 사용할 수 없어요",
  }[status];
}

function formatTime(seconds: number): string {
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function playCompletionTone() {
  try {
    const context = new AudioContext();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.value = 740;
    gain.gain.setValueAtTime(0.08, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.28);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.28);
  } catch {
    // Completion remains visible when audio is blocked.
  }
}
