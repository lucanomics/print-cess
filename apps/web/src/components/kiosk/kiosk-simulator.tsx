"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  Download,
  FileCheck2,
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
import { Wordmark } from "@print-cess/ui";

import {
  detectFileKind,
  parseJpegDimensions,
  parsePngDimensions,
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

export function KioskSimulator({ automaticPrinting = false }: { automaticPrinting?: boolean }) {
  const [session, setSession] = useState<RegisteredSession>();
  const [status, setStatus] = useState<KioskStatus>("preparing");
  const [remaining, setRemaining] = useState(120);
  const [completionRemaining, setCompletionRemaining] = useState(60);
  const [artifact, setArtifact] = useState<PrintArtifact>();
  const [generation, setGeneration] = useState(0);
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
    setRemaining(120);
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
        setRemaining(Math.max(0, Math.ceil((body.expiresAt - Date.now()) / 1000)));
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
            setRemaining(Math.max(0, Math.ceil((body.expiresAt - Date.now()) / 1000)));
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

  const countdownLabel = status === "preparing" || status === "waiting" ? "QR코드 변경까지" : "작업 만료까지";

  return (
    <main className="kiosk-shell">
      <Wordmark />
      <div className="kiosk-layout">
        <section className="kiosk-instructions">
          <h1
            className="kiosk-step-heading"
            aria-label="휴대전화 카메라를 여세요. QR코드를 스캔하세요"
          >
            <span className="kiosk-step-number" aria-hidden="true">
              1
            </span>
            <span>휴대전화 카메라를 여세요</span>
          </h1>
          <p className="kiosk-english">Open your phone camera</p>
          <div className="kiosk-facts">
            <p>
              <FileCheck2 aria-hidden="true" />
              <span>
                지원 파일 형식
                <br />
                <strong>PDF, JPG, PNG</strong>
              </span>
            </p>
            <p>
              <LockKeyhole aria-hidden="true" />
              <span>
                인쇄가 끝나면
                <br />
                파일은 자동 삭제됩니다
              </span>
            </p>
          </div>
          <div className="kiosk-status-row" aria-live="polite">
            <span className="kiosk-status-dot">
              <CheckCircle2 aria-hidden="true" />
            </span>
            <strong>{statusLabel(status)}</strong>
            <span className="kiosk-countdown">
              {countdownLabel} <b>{formatTime(remaining)}</b>
            </span>
          </div>
        </section>
        <section
          className="kiosk-qr"
          aria-label="휴대전화로 스캔할 QR코드"
          data-session-url={session?.qrUrl}
        >
          <div className="kiosk-qr__instruction">
            <span className="kiosk-step-number" aria-hidden="true">
              2
            </span>
            <div>
              <strong>QR코드를 카메라로 비추세요</strong>
              <small>Point your camera at the QR code</small>
            </div>
          </div>
          {session ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={session.qrImage} alt="휴대전화로 스캔할 Print-cess 보안 QR코드" />
          ) : (
            <div className="kiosk-qr__loading" aria-busy="true" />
          )}
          <div className="kiosk-qr__action">
            <span className="kiosk-step-number" aria-hidden="true">
              3
            </span>
            <Smartphone aria-hidden="true" />
            <div>
              <strong>화면에 나타나는 링크를 누르세요</strong>
              <small>사진을 찍을 필요는 없습니다 · Tap the link that appears</small>
            </div>
          </div>
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
    if (detected === "pdf") await validatePdf(plaintext);
    else if (detected === "png") parsePngDimensions(plaintext);
    else parseJpegDimensions(plaintext);
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
    waiting: "준비",
    claimed: "휴대전화 연결됨",
    uploading: "파일 전송 중",
    uploaded: "파일 수신 완료",
    validating: "파일 검증 중",
    printing: "인쇄 중",
    completed: "출력 완료",
    failed: "서비스 일시 중단",
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
      data-printing-mode={automaticPrinting ? "automatic" : "interactive"}
    >
      <Wordmark />
      <CheckCircle2 aria-hidden="true" />
      <h1>{automaticPrinting ? "자동 인쇄가 시작됐습니다" : "인쇄 준비가 완료됐습니다"}</h1>
      <p>
        <Printer aria-hidden="true" />
        {automaticPrinting ? "프린터 출력구를 확인하세요" : "인쇄 창을 확인하세요"}
      </p>
      <div className="kiosk-result__actions">
        {automaticPrinting ? null : (
          <button type="button" onClick={() => void printArtifact(artifact)}>
            <Printer aria-hidden="true" /> 인쇄 창 다시 열기
          </button>
        )}
        <a href={artifact.url} download={artifact.filename} className="kiosk-download">
          <Download aria-hidden="true" /> 파일 다운로드
        </a>
      </div>
      <span>서버 파일 삭제 완료 · {remaining}초 후 새 QR</span>
    </main>
  );
}

function UnavailableScreen({ onReset }: { onReset: () => void }) {
  return (
    <main className="kiosk-result kiosk-result--error">
      <Wordmark />
      <ShieldCheck aria-hidden="true" />
      <h1>인쇄 서비스를 잠시 사용할 수 없습니다</h1>
      <p>잠시 후 다시 시도해주세요.</p>
      <span>업로드된 파일은 삭제됩니다.</span>
      <button type="button" onClick={onReset}>
        개발 시뮬레이터 초기화
      </button>
    </main>
  );
}
