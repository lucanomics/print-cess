"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  FileCheck2,
  LockKeyhole,
  Printer,
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
import { Wordmark } from "@print-cess/ui";

import {
  detectFileKind,
  parseJpegDimensions,
  parsePngDimensions,
  validatePdf,
} from "@/lib/file-validation";
import { normalizeEntityTag } from "@/lib/entity-tag";

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

export function KioskSimulator() {
  const [session, setSession] = useState<RegisteredSession>();
  const [status, setStatus] = useState<KioskStatus>("preparing");
  const [remaining, setRemaining] = useState(180);
  const [completionRemaining, setCompletionRemaining] = useState(15);
  const [generation, setGeneration] = useState(0);
  const processing = useRef(false);

  const reset = useCallback(() => {
    processing.current = false;
    setSession(undefined);
    setStatus("preparing");
    setCompletionRemaining(15);
    setGeneration((value) => value + 1);
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
            await consumeAndPrint(session, setStatus);
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
  }, [reset, session, status]);

  useEffect(() => {
    if (status !== "completed") return;
    const deadline = Date.now() + 15_000;
    const tick = () => {
      setCompletionRemaining(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
    };
    const interval = window.setInterval(tick, 250);
    const timeout = window.setTimeout(reset, 15_000);
    return () => {
      window.clearInterval(interval);
      window.clearTimeout(timeout);
    };
  }, [reset, status]);

  if (status === "completed") return <CompletedScreen remaining={completionRemaining} />;
  if (status === "failed") return <UnavailableScreen onReset={reset} />;

  return (
    <main className="kiosk-shell">
      <Wordmark />
      <div className="kiosk-layout">
        <section className="kiosk-instructions">
          <h1>
            휴대전화 카메라로
            <br />
            QR코드를 스캔하세요
          </h1>
          <p className="kiosk-english">Scan with your phone camera</p>
          <div className="kiosk-rule" />
          <p className="kiosk-data">
            <WifiOff aria-hidden="true" />{" "}
            <span>
              <strong>Wi-Fi는 필요하지 않습니다.</strong>
              <br />
              휴대전화 모바일 데이터를 사용하세요
            </span>
          </p>
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
              세션 만료까지 <b>{formatTime(remaining)}</b>
            </span>
          </div>
        </section>
        <section
          className="kiosk-qr"
          aria-label="Mobile session QR code"
          data-session-url={session?.qrUrl}
        >
          {session ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={session.qrImage} alt="휴대전화로 스캔할 Print-cess 보안 QR코드" />
          ) : (
            <div className="kiosk-qr__loading" aria-busy="true" />
          )}
          <p>
            <Smartphone aria-hidden="true" />
            카메라를 열고 QR코드를 비추면
            <br />
            안전한 연결이 시작됩니다
          </p>
        </section>
      </div>
    </main>
  );
}

async function consumeAndPrint(
  session: RegisteredSession,
  setStatus: (status: KioskStatus) => void,
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
    const downloadedEtag = normalizeEntityTag(download.headers.get("etag"));
    const expectedEtag = normalizeEntityTag(operation.etag);
    if (
      envelope.byteLength !== operation.size ||
      !downloadedEtag ||
      !expectedEtag ||
      downloadedEtag !== expectedEtag
    )
      throw new Error("metadata mismatch");
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
    setStatus("printing");
    await kioskTransition(session, "printing");
    await new Promise((resolve) => window.setTimeout(resolve, 900));
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

function CompletedScreen({ remaining }: { remaining: number }) {
  return (
    <main className="kiosk-result kiosk-result--success">
      <Wordmark />
      <CheckCircle2 aria-hidden="true" />
      <h1>출력물을 가져가세요</h1>
      <p>
        <Printer aria-hidden="true" /> 프린터 출력구를 확인하세요
      </p>
      <span>암호화된 파일 삭제 완료 · {remaining}초 후 새 QR</span>
    </main>
  );
}

function UnavailableScreen({ onReset }: { onReset: () => void }) {
  return (
    <main className="kiosk-result kiosk-result--error">
      <Wordmark />
      <ShieldCheck aria-hidden="true" />
      <h1>인쇄 서비스를 잠시 사용할 수 없습니다</h1>
      <p>Error code: P-01</p>
      <span>업로드된 파일은 삭제됩니다.</span>
      <button type="button" onClick={onReset}>
        개발 시뮬레이터 초기화
      </button>
    </main>
  );
}
