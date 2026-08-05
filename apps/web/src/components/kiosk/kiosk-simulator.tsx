"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  Download,
  FileCheck2,
  Languages,
  LockKeyhole,
  Printer,
  ScanLine,
  ShieldCheck,
  Smartphone,
  WifiOff,
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
  isRightToLeft,
  LOCALE_NAMES,
  SUPPORTED_LOCALES,
  translate,
  type SupportedLocale,
} from "@print-cess/i18n";
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

// Korean and English stay on screen permanently; the remaining languages take
// turns on one line so a visitor sees the same instruction in their own
// language without the display filling up with text.
const SPOTLIGHT_LOCALES: readonly SupportedLocale[] = SUPPORTED_LOCALES.filter(
  (locale) => locale !== "ko" && locale !== "en",
);
const SPOTLIGHT_INTERVAL_MS = 4500;

const KIOSK_STEPS = [
  { icon: ScanLine, korean: "QR코드 스캔", english: "Scan the QR code" },
  { icon: Smartphone, korean: "휴대전화에서 문서 한 개 고르기", english: "Pick one file" },
  { icon: Printer, korean: "여기에서 종이 받기", english: "Take your paper here" },
] as const;

type RegisteredSession = {
  sessionId: string;
  expiresAt: number;
  kioskToken: string;
  qrUrl: string;
  qrImage: string;
  privateKey: CryptoKey;
  fingerprint: string;
};

export function KioskSimulator({ automaticPrinting = false }: { automaticPrinting?: boolean }) {
  const [session, setSession] = useState<RegisteredSession>();
  const [status, setStatus] = useState<KioskStatus>("preparing");
  const [remaining, setRemaining] = useState(180);
  const [completionRemaining, setCompletionRemaining] = useState(60);
  const [artifact, setArtifact] = useState<PrintArtifact>();
  const [generation, setGeneration] = useState(0);
  const [spotlightIndex, setSpotlightIndex] = useState(0);
  const processing = useRef(false);
  const artifactRef = useRef<PrintArtifact | undefined>(undefined);

  const replaceArtifact = useCallback((nextArtifact: PrintArtifact | undefined) => {
    revokePrintArtifact(artifactRef.current);
    artifactRef.current = nextArtifact;
    setArtifact(nextArtifact);
  }, []);

  const reset = useCallback(() => {
    processing.current = false;
    replaceArtifact(undefined);
    setSession(undefined);
    setStatus("preparing");
    setCompletionRemaining(60);
    setGeneration((value) => value + 1);
  }, [replaceArtifact]);

  useEffect(
    () => () => {
      revokePrintArtifact(artifactRef.current);
      artifactRef.current = undefined;
    },
    [],
  );

  useEffect(() => {
    const timer = window.setInterval(
      () => setSpotlightIndex((index) => (index + 1) % SPOTLIGHT_LOCALES.length),
      SPOTLIGHT_INTERVAL_MS,
    );
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      let preparationStep = "key-generation";
      try {
        const keyPair = await generateEcdhKeyPair();
        const kioskPublicKey = await exportPublicKeyBase64Url(keyPair.publicKey);
        const fingerprint = await fingerprintPublicKey(kioskPublicKey);
        preparationStep = "session-registration";
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
        preparationStep = "qr-rendering";
        const qrImage = await QRCode.toDataURL(body.qrUrl, {
          errorCorrectionLevel: "M",
          margin: 2,
          scale: 11,
          color: { dark: "#071737", light: "#ffffff" },
        });
        if (!active) return;
        setSession({ ...body, qrImage, privateKey: keyPair.privateKey, fingerprint });
        setStatus("waiting");
      } catch (error) {
        if (process.env.NODE_ENV !== "production") {
          console.error(
            `Kiosk preparation failed during ${preparationStep}: ${error instanceof Error ? error.message : "unknown error"}.`,
          );
        }
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
          const body = (await response.json()) as { status: string };
          if (!active) return;
          if (body.status === "expired" || body.status === "cancelled") {
            reset();
            return;
          }
          if (body.status === "failed") {
            setStatus("failed");
            return;
          }
          if (body.status === "claimed") setStatus("claimed");
          if (body.status === "upload_authorized" || body.status === "uploading")
            setStatus("uploading");
          if (body.status === "uploaded" && !processing.current) {
            processing.current = true;
            setStatus("uploaded");
            await consumeAndPrint(session, setStatus, replaceArtifact);
            if (active) {
              playCompletionTone();
            }
          }
        } catch {
          // Transient polling errors do not change the kiosk screen.
        }
      })();
    }, 750);
    return () => {
      active = false;
      window.clearInterval(poll);
    };
  }, [replaceArtifact, reset, session, status]);

  useEffect(() => {
    if (status !== "completed") return;
    const deadline = Date.now() + 60_000;
    const tick = () => {
      setCompletionRemaining(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
    };
    const interval = window.setInterval(tick, 250);
    const timeout = window.setTimeout(reset, 60_000);
    return () => {
      window.clearInterval(interval);
      window.clearTimeout(timeout);
    };
  }, [reset, status]);

  if (status === "completed" && artifact)
    return (
      <CompletedScreen
        artifact={artifact}
        automaticPrinting={automaticPrinting}
        remaining={completionRemaining}
      />
    );
  if (status === "failed") return <UnavailableScreen onReset={reset} />;

  const spotlight = SPOTLIGHT_LOCALES[spotlightIndex] ?? "zh-CN";

  return (
    <main className="kiosk-shell" lang="ko">
      <Wordmark />
      <div className="kiosk-layout">
        <section className="kiosk-instructions">
          <h1>
            휴대전화 카메라로
            <br />
            QR코드를 스캔하세요
          </h1>
          <p className="kiosk-english" lang="en">
            Scan the QR code with your phone camera
          </p>
          <p
            className="kiosk-spotlight"
            lang={spotlight}
            dir={isRightToLeft(spotlight) ? "rtl" : "ltr"}
            aria-hidden="true"
          >
            <span>{LOCALE_NAMES[spotlight]}</span>
            {translate(spotlight, "kioskScanTitle")}
          </p>
          <ol className="kiosk-steps">
            {KIOSK_STEPS.map(({ icon: Icon, korean, english }, index) => (
              <li key={korean}>
                <span className="kiosk-steps__number" aria-hidden="true">
                  {index + 1}
                </span>
                <span className="kiosk-steps__text">
                  <strong>{korean}</strong>
                  <small lang="en">{english}</small>
                </span>
                <Icon className="kiosk-steps__icon" aria-hidden="true" />
              </li>
            ))}
          </ol>
          <div className="kiosk-facts">
            <p>
              <WifiOff aria-hidden="true" />
              <span>
                Wi-Fi는 필요 없습니다
                <br />
                <strong>모바일 데이터 사용</strong>
              </span>
            </p>
            <p>
              <FileCheck2 aria-hidden="true" />
              <span>
                인쇄할 수 있는 파일
                <br />
                <strong>PDF, JPG, PNG</strong>
              </span>
            </p>
            <p>
              <LockKeyhole aria-hidden="true" />
              <span>
                인쇄가 끝나면
                <br />
                <strong>파일 자동 삭제</strong>
              </span>
            </p>
          </div>
          <div className="kiosk-status-row" aria-live="polite">
            <span className="kiosk-status-dot">
              <CheckCircle2 aria-hidden="true" />
            </span>
            <strong>{statusLabel(status)}</strong>
            <span className="kiosk-countdown">
              남은 시간 <b>{formatTime(remaining)}</b>
            </span>
          </div>
        </section>
        <section
          className="kiosk-qr"
          aria-label="Mobile session QR code"
          // The QR URL carries the one-time upload token and key fingerprint.
          // End-to-end tests need to read it, but a Production kiosk must not
          // publish it as page text where a DOM snapshot or an extension could
          // pick it up; the QR image alone is enough there.
          data-session-url={process.env.NODE_ENV === "production" ? undefined : session?.qrUrl}
        >
          {session ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={session.qrImage} alt="휴대전화로 스캔할 Print-cess 보안 QR코드" />
          ) : (
            <div className="kiosk-qr__loading" aria-busy="true" />
          )}
          <p className="kiosk-languages">
            <Languages aria-hidden="true" />
            <span>
              {SUPPORTED_LOCALES.length}개 언어로 안내합니다
              <br />
              <small lang="en">Guidance in {SUPPORTED_LOCALES.length} languages</small>
            </span>
          </p>
        </section>
      </div>
    </main>
  );
}

async function consumeAndPrint(
  session: RegisteredSession,
  setStatus: (status: KioskStatus) => void,
  setArtifact: (artifact: PrintArtifact | undefined) => void,
) {
  let envelope: Uint8Array<ArrayBufferLike> = new Uint8Array();
  let plaintext: Uint8Array<ArrayBufferLike> = new Uint8Array();
  try {
    const consumeId = generateToken();
    const consumeResponse = await fetch(`/api/sessions/${session.sessionId}/consume`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-print-cess-kiosk-token": session.kioskToken,
      },
      body: JSON.stringify({ consumeIdHash: await hashToken(consumeId, "kiosk") }),
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
    const detected = detectFileKind(plaintext);
    if (detected !== decrypted.fileKind) throw new Error("file kind mismatch");
    if (detected === "pdf") {
      await validatePdf(plaintext);
    } else {
      // `docs/SECURITY.md` requires the kiosk to enforce the image dimension
      // and resource budget itself, not to inherit the phone's verdict.
      const { width, height } =
        detected === "png" ? parsePngDimensions(plaintext) : parseJpegDimensions(plaintext);
      validateDimensions(width, height, plaintext.byteLength);
    }
    const artifact = createPrintArtifact(plaintext, decrypted.fileKind);
    setArtifact(artifact);
    setStatus("printing");
    await kioskTransition(session, "printing");
    await printArtifact(artifact).catch(() => undefined);
    await kioskTransition(session, "completed");
    setStatus("completed");
  } catch {
    setStatus("failed");
    await kioskTransition(session, "failed").catch(() => undefined);
  } finally {
    envelope.fill(0);
    plaintext.fill(0);
  }
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

function statusLabel(status: KioskStatus): string {
  return {
    preparing: "준비 중",
    waiting: "사용할 수 있어요",
    claimed: "휴대전화가 연결됐어요",
    uploading: "문서를 받고 있어요",
    uploaded: "문서를 받았어요",
    validating: "문서를 확인하고 있어요",
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
    // The visual completion state remains complete when audio is blocked.
  }
}

function CompletedScreen({
  artifact,
  automaticPrinting,
  remaining,
}: {
  artifact: PrintArtifact;
  automaticPrinting: boolean;
  remaining: number;
}) {
  return (
    <main
      className="kiosk-result kiosk-result--success"
      lang="ko"
      data-printing-mode={automaticPrinting ? "automatic" : "interactive"}
    >
      <Wordmark />
      <CheckCircle2 aria-hidden="true" />
      <h1>{automaticPrinting ? "인쇄가 시작됐어요" : "인쇄 준비가 끝났어요"}</h1>
      <p>
        <Printer aria-hidden="true" />
        {automaticPrinting ? "프린터에서 종이를 가져가세요" : "화면의 인쇄 창을 확인하세요"}
      </p>
      <p className="kiosk-result__english" lang="en">
        {automaticPrinting
          ? "Your page is printing. Take it from the printer."
          : "Confirm the print dialog on this screen."}
      </p>
      <div className="kiosk-result__actions">
        {automaticPrinting ? null : (
          <button type="button" onClick={() => void printArtifact(artifact)}>
            <Printer aria-hidden="true" /> 인쇄 창 다시 열기
          </button>
        )}
        {/* Operator-only recovery path: it writes a plaintext copy into the
            kiosk account's Downloads folder, so it must never read as a normal
            visitor action. See docs/VERCEL_DEPLOYMENT.md. */}
        <a href={artifact.url} download={artifact.filename} className="kiosk-download">
          <Download aria-hidden="true" /> 파일 다운로드 (직원용)
        </a>
      </div>
      <span>서버에 보관된 파일은 삭제됐습니다 · {remaining}초 후 새 QR코드</span>
    </main>
  );
}

function UnavailableScreen({ onReset }: { onReset: () => void }) {
  return (
    <main className="kiosk-result kiosk-result--error" lang="ko">
      <Wordmark />
      <ShieldCheck aria-hidden="true" />
      <h1>지금은 인쇄할 수 없어요</h1>
      <p>잠시 뒤에 다시 시도해 주세요.</p>
      <p className="kiosk-result__english" lang="en">
        Printing is unavailable right now. Please try again in a moment.
      </p>
      <span>보내신 파일은 삭제됐습니다.</span>
      <button type="button" onClick={onReset}>
        새 QR코드 만들기
      </button>
    </main>
  );
}
