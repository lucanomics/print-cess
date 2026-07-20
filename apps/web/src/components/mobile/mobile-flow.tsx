"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  FileDown,
  FileImage,
  Files,
  Headphones,
  Image as ImageIcon,
  LockKeyhole,
  Mail,
  MessageCircle,
  Printer,
  TriangleAlert,
} from "lucide-react";

import {
  encryptDocument,
  fingerprintPublicKey,
  fromBase64Url,
  generateToken,
  hashToken,
  timingSafeEqual,
} from "@print-cess/crypto";
import { LOCALE_NAMES, SUPPORTED_LOCALES, translate, type SupportedLocale } from "@print-cess/i18n";
import {
  PrimaryButton,
  ProgressSteps,
  ScreenShell,
  SecondaryButton,
  StatusIcon,
  Wordmark,
} from "@print-cess/ui";

import {
  authorizeUpload,
  cancelSession,
  claimSession,
  completeUpload,
  getMobileStatus,
  startUpload,
  uploadCiphertext,
  ApiClientError,
} from "@/lib/api-client";
import { BrowserSpeechSynthesisGuide } from "@/lib/audio-guide";
import {
  FileValidationError,
  validateFileForMobile,
  type ValidatedMobileFile,
} from "@/lib/file-validation";
import { parseSessionFragment } from "@/lib/session-fragment";
import { DocumentPreview } from "./document-preview";

type Stage =
  | "boot"
  | "language"
  | "location"
  | "locationGuide"
  | "file"
  | "preview"
  | "transfer"
  | "progress"
  | "complete"
  | "missing"
  | "error";
type Location = "photos" | "files" | "kakao" | "email" | "missing";
type ClaimedSession = Awaited<ReturnType<typeof claimSession>>;

const LOCATION_OPTIONS: Array<{ value: Location; key: string; icon: typeof ImageIcon }> = [
  { value: "photos", key: "locationPhotos", icon: ImageIcon },
  { value: "files", key: "locationFiles", icon: Files },
  { value: "kakao", key: "locationKakao", icon: MessageCircle },
  { value: "email", key: "locationEmail", icon: Mail },
  { value: "missing", key: "locationMissing", icon: FileDown },
];

export function MobileFlow({ sessionId }: { sessionId: string }) {
  const [stage, setStage] = useState<Stage>("boot");
  const [locale, setLocale] = useState<SupportedLocale>("en");
  const [location, setLocation] = useState<Location>();
  const [claimed, setClaimed] = useState<ClaimedSession>();
  const [mobileToken, setMobileToken] = useState("");
  const [file, setFile] = useState<File>();
  const [validated, setValidated] = useState<ValidatedMobileFile>();
  const [errorKey, setErrorKey] = useState("networkError");
  const [progressKey, setProgressKey] = useState("encrypting");
  const [reminderStage, setReminderStage] = useState<Stage>();
  const fileInput = useRef<HTMLInputElement>(null);
  const text = useCallback(
    (key: string, values?: Record<string, string | number>) => translate(locale, key, values),
    [locale],
  );
  const guide = useMemo(
    () =>
      new BrowserSpeechSynthesisGuide((key, requestedLocale) =>
        translate(
          (SUPPORTED_LOCALES.includes(requestedLocale as SupportedLocale)
            ? requestedLocale
            : "en") as SupportedLocale,
          key,
        ),
      ),
    [],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => setReminderStage(stage), 30_000);
    return () => window.clearTimeout(timer);
  }, [stage]);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const clearDocument = useCallback(() => {
    setValidated((current) => {
      current?.bytes.fill(0);
      return undefined;
    });
    setFile(undefined);
    if (fileInput.current) fileInput.current.value = "";
  }, []);

  const cancelClaim = useCallback(async () => {
    if (mobileToken) {
      await cancelSession(sessionId, mobileToken).catch(() => undefined);
    }
    clearDocument();
    setClaimed(undefined);
    setMobileToken("");
  }, [clearDocument, mobileToken, sessionId]);

  useEffect(() => {
    let active = true;
    void (async () => {
      const fragment = parseSessionFragment(window.location.hash);
      if (!fragment) {
        if (active) {
          setErrorKey("invalidQr");
          setStage("error");
        }
        return;
      }
      try {
        const nextMobileToken = generateToken();
        const claimId = generateToken();
        const response = await claimSession({
          sessionId,
          uploadToken: fragment.uploadToken,
          mobileTokenHash: await hashToken(nextMobileToken, "mobile"),
          claimIdHash: await hashToken(claimId, "mobile"),
        });
        const computed = await fingerprintPublicKey(response.kioskPublicKey);
        if (!timingSafeEqual(fromBase64Url(computed), fromBase64Url(fragment.fingerprint))) {
          await cancelSession(sessionId, nextMobileToken).catch(() => undefined);
          throw new Error("fingerprintMismatch");
        }
        if (response.kioskPublicKeyFingerprint !== fragment.fingerprint) {
          await cancelSession(sessionId, nextMobileToken).catch(() => undefined);
          throw new Error("fingerprintMismatch");
        }
        if (!active) return;
        setClaimed(response);
        setMobileToken(nextMobileToken);
        history.replaceState(null, "", window.location.pathname + "#claimed");
        setStage("language");
      } catch (error) {
        if (!active) return;
        setErrorKey(
          error instanceof ApiClientError && error.status === 409
            ? "usedQr"
            : error instanceof ApiClientError && error.status === 410
              ? "expiredQr"
              : error instanceof Error && error.message === "fingerprintMismatch"
                ? "fingerprintMismatch"
                : "networkError",
        );
        setStage("error");
      }
    })();
    return () => {
      active = false;
    };
  }, [sessionId]);

  const chooseFile = useCallback(
    async (selected: File | undefined) => {
      if (!selected) {
        await cancelClaim();
        setErrorKey("cancelled");
        setStage("error");
        return;
      }
      try {
        const result = await validateFileForMobile(selected);
        setFile(selected);
        setValidated(result);
        setStage("preview");
      } catch (error) {
        await cancelClaim();
        setErrorKey(error instanceof FileValidationError ? error.code : "damagedFile");
        setStage("error");
      }
    },
    [cancelClaim],
  );

  useEffect(() => {
    const input = fileInput.current;
    if (!input || stage !== "file") return;
    const handleCancel = () => void chooseFile(undefined);
    input.addEventListener("cancel", handleCancel);
    return () => input.removeEventListener("cancel", handleCancel);
  }, [chooseFile, stage]);

  const print = useCallback(async () => {
    if (!claimed || !validated || !mobileToken) return;
    let envelope: Uint8Array | undefined;
    try {
      setStage("transfer");
      setProgressKey("encrypting");
      envelope = await encryptDocument({
        plaintext: validated.bytes,
        fileKind: validated.fileKind,
        kioskPublicKey: claimed.kioskPublicKey,
        context: {
          protocolVersion: 1,
          sessionId,
          kioskPublicKeyFingerprint: claimed.kioskPublicKeyFingerprint,
        },
      });
      const operationId = generateToken();
      const authorization = await authorizeUpload(
        sessionId,
        mobileToken,
        await hashToken(operationId, "mobile"),
      );
      await startUpload(sessionId, mobileToken);
      setProgressKey("uploading");
      const metadata = await uploadCiphertext(authorization, envelope);
      await completeUpload(sessionId, mobileToken, metadata);
      setProgressKey("waitingForPrint");
      setStage("progress");
      for (let attempt = 0; attempt < 120; attempt += 1) {
        const status = await getMobileStatus(sessionId, mobileToken);
        if (status.status === "completed") {
          clearDocument();
          setClaimed(undefined);
          setMobileToken("");
          setStage("complete");
          return;
        }
        if (["failed", "expired", "cancelled"].includes(status.status))
          throw new Error("networkError");
        await new Promise((resolve) => window.setTimeout(resolve, 1000));
      }
      throw new Error("networkError");
    } catch (error) {
      await cancelClaim();
      setErrorKey(
        error instanceof ApiClientError && error.status === 410 ? "expiredQr" : "networkError",
      );
      setStage("error");
    } finally {
      envelope?.fill(0);
    }
  }, [cancelClaim, claimed, clearDocument, mobileToken, sessionId, validated]);

  const step =
    stage === "language"
      ? 1
      : stage === "location" || stage === "locationGuide" || stage === "missing"
        ? 2
        : stage === "file"
          ? 3
          : stage === "preview"
            ? 4
            : 5;

  return (
    <ScreenShell>
      <Wordmark compact />
      {stage !== "boot" && stage !== "error" && stage !== "complete" ? (
        <ProgressSteps current={step} total={5} label={text("step", { current: step, total: 5 })} />
      ) : null}
      {reminderStage === stage && !["boot", "complete", "error"].includes(stage) ? (
        <p className="mobile-reminder" role="status">
          {text(stage === "preview" ? "previewHelp" : "fileRules")}
        </p>
      ) : null}
      {stage === "boot" ? <Loading /> : null}
      {stage === "language" ? (
        <LanguageStep
          locale={locale}
          onSelect={setLocale}
          onContinue={() => setStage("location")}
        />
      ) : null}
      {stage === "location" ? (
        <LocationStep
          value={location}
          text={text}
          onChange={setLocation}
          onContinue={() => {
            if (location === "missing") setStage("missing");
            else if (location === "kakao" || location === "email") setStage("locationGuide");
            else setStage("file");
          }}
        />
      ) : null}
      {stage === "locationGuide" && location ? (
        <SingleAction
          title={text(location === "kakao" ? "locationKakao" : "locationEmail")}
          body={text(location === "kakao" ? "kakaoGuide" : "emailGuide")}
          action={text("continue")}
          onAction={() => setStage("file")}
        />
      ) : null}
      {stage === "missing" ? (
        <SingleAction
          title={text("missingTitle")}
          body={text("missingBody")}
          action={text("continue")}
          onAction={() => setStage("location")}
        />
      ) : null}
      {stage === "file" ? (
        <section className="mobile-step">
          <StatusIcon>
            <FileImage size={32} aria-hidden="true" />
          </StatusIcon>
          <h1>{text("chooseFile")}</h1>
          <p>{text("fileRules")}</p>
          <input
            ref={fileInput}
            className="visually-hidden"
            type="file"
            accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png"
            onChange={(event) => void chooseFile(event.target.files?.[0])}
          />
          <PrimaryButton onClick={() => fileInput.current?.click()}>
            {text("chooseFile")}
          </PrimaryButton>
        </section>
      ) : null}
      {stage === "preview" && file && validated ? (
        <section className="mobile-step mobile-step--preview">
          <h1>{text("checkDocument")}</h1>
          <p>{text("previewHelp")}</p>
          <DocumentPreview file={file} validated={validated} />
          <div className="mobile-summary">
            <p>
              <Printer aria-hidden="true" /> {text("printSummary")}
            </p>
            <p>
              <LockKeyhole aria-hidden="true" /> {text("privacySummary")}
            </p>
          </div>
          <PrimaryButton onClick={() => void print()}>
            <Printer aria-hidden="true" /> {text("printOneCopy")}
          </PrimaryButton>
          <SecondaryButton
            onClick={() => {
              clearDocument();
              setStage("file");
            }}
          >
            {text("chooseAnother")}
          </SecondaryButton>
        </section>
      ) : null}
      {stage === "transfer" || stage === "progress" ? (
        <ProgressState text={text(progressKey)} />
      ) : null}
      {stage === "complete" ? (
        <SingleAction
          icon="success"
          title={text("completed")}
          body={text("collectOutput")}
          action={text("listenAgain")}
          onAction={() => void guide.play("collectOutput", locale)}
        />
      ) : null}
      {stage === "error" ? (
        <SingleAction
          icon="error"
          title={text(errorKey)}
          body=""
          action={text("listenAgain")}
          onAction={() => void guide.play(errorKey, locale)}
        />
      ) : null}
    </ScreenShell>
  );
}

function Loading() {
  return (
    <section className="mobile-step" aria-busy="true">
      <div className="mobile-spinner" />
      <p>Preparing secure session…</p>
    </section>
  );
}

function LanguageStep({
  locale,
  onSelect,
  onContinue,
}: {
  locale: SupportedLocale;
  onSelect: (locale: SupportedLocale) => void;
  onContinue: () => void;
}) {
  return (
    <section className="mobile-step">
      <h1>{translate(locale, "selectLanguage")}</h1>
      <div className="language-grid">
        {SUPPORTED_LOCALES.map((candidate) => (
          <label
            key={candidate}
            className={candidate === locale ? "choice-row is-selected" : "choice-row"}
          >
            <input
              type="radio"
              name="locale"
              checked={candidate === locale}
              onChange={() => onSelect(candidate)}
            />
            <span>{LOCALE_NAMES[candidate]}</span>
          </label>
        ))}
      </div>
      <PrimaryButton onClick={onContinue}>{translate(locale, "continue")}</PrimaryButton>
    </section>
  );
}

function LocationStep({
  value,
  text,
  onChange,
  onContinue,
}: {
  value: Location | undefined;
  text: (key: string) => string;
  onChange: (value: Location) => void;
  onContinue: () => void;
}) {
  return (
    <section className="mobile-step">
      <h1>{text("chooseLocation")}</h1>
      <div className="choice-list">
        {LOCATION_OPTIONS.map(({ value: candidate, key, icon: Icon }) => (
          <label
            key={candidate}
            className={candidate === value ? "choice-row is-selected" : "choice-row"}
          >
            <input
              type="radio"
              name="location"
              checked={candidate === value}
              onChange={() => onChange(candidate)}
            />
            <Icon aria-hidden="true" />
            <span>{text(key)}</span>
          </label>
        ))}
      </div>
      <PrimaryButton disabled={!value} onClick={onContinue}>
        {text("continue")}
      </PrimaryButton>
    </section>
  );
}

function SingleAction({
  icon = "info",
  title,
  body,
  action,
  onAction,
}: {
  icon?: "info" | "success" | "error";
  title: string;
  body: string;
  action: string;
  onAction: () => void;
}) {
  const Icon = icon === "success" ? CheckCircle2 : icon === "error" ? TriangleAlert : Headphones;
  return (
    <section className="mobile-step mobile-step--single">
      <StatusIcon tone={icon}>
        <Icon size={34} aria-hidden="true" />
      </StatusIcon>
      <h1>{title}</h1>
      {body ? <p>{body}</p> : null}
      <PrimaryButton onClick={onAction}>{action}</PrimaryButton>
    </section>
  );
}

function ProgressState({ text }: { text: string }) {
  return (
    <section className="mobile-step mobile-step--single" aria-live="polite">
      <div className="mobile-spinner" />
      <h1>{text}</h1>
      <p>Keep this page open.</p>
    </section>
  );
}
