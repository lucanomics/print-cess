"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Ban,
  CheckCircle2,
  CircleQuestionMark,
  FileCheck2,
  FileImage,
  Files,
  Headphones,
  Image as ImageIcon,
  LockKeyhole,
  Mail,
  MessageCircle,
  Printer,
  ScanLine,
  TriangleAlert,
  Volume2,
  X,
} from "lucide-react";

import {
  encryptDocument,
  fingerprintPublicKey,
  fromBase64Url,
  generateToken,
  hashToken,
  timingSafeEqual,
} from "@print-cess/crypto";
import {
  isRightToLeft,
  LOCALE_NAMES,
  SUPPORTED_LOCALES,
  translate,
  type SupportedLocale,
} from "@print-cess/i18n";
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
  validateMobileDocument,
  type ValidatedMobileFile,
} from "@/lib/mobile-document-validation";
import { parseSessionFragment } from "@/lib/session-fragment";
import { clearBrowserSiteData } from "@/lib/session-teardown";
import { DocumentPreview } from "./document-preview";

type Stage =
  | "boot"
  | "language"
  | "guide"
  | "file"
  | "preview"
  | "transfer"
  | "progress"
  | "complete"
  | "closed"
  | "error";
type ClaimedSession = Awaited<ReturnType<typeof claimSession>>;
type Text = (key: string, values?: Record<string, string | number>) => string;

// One short instruction per screen, written for a visitor who has never used a
// kiosk before. The help sheet and the spoken guide both read from this map.
const HELP_KEYS: Record<Stage, string> = {
  boot: "helpProgress",
  language: "helpLanguage",
  guide: "helpGuide",
  file: "helpFile",
  preview: "helpPreview",
  transfer: "helpProgress",
  progress: "helpProgress",
  complete: "helpDone",
  closed: "helpDone",
  error: "helpError",
};

// A tab the visitor opened by scanning a QR was not opened by script, so most
// browsers refuse `window.close()`. Try anyway, and fall back to a screen that
// carries nothing from the visit.
const CLOSE_CONFIRM_MS = 150;
// Long enough to read the collection instruction and walk to the printer.
const AUTOMATIC_SHUTDOWN_MS = 30_000;

function guideStepsFor(supportsHancom: boolean) {
  return [
    { icon: ScanLine, title: "guideScanTitle", body: "guideScanBody", completed: true },
    {
      icon: ImageIcon,
      title: "guideChooseTitle",
      body: supportsHancom ? "guideChooseBodyHwpx" : "guideChooseBody",
      completed: false,
    },
    { icon: FileCheck2, title: "guideCheckTitle", body: "guideCheckBody", completed: false },
    { icon: Printer, title: "guideCollectTitle", body: "guideCollectBody", completed: false },
  ] as const;
}

export function MobileFlow({ sessionId }: { sessionId: string }) {
  const [stage, setStage] = useState<Stage>("boot");
  const [locale, setLocale] = useState<SupportedLocale>("en");
  const [claimed, setClaimed] = useState<ClaimedSession>();
  const [mobileToken, setMobileToken] = useState("");
  const [file, setFile] = useState<File>();
  const [validated, setValidated] = useState<ValidatedMobileFile>();
  const [errorKey, setErrorKey] = useState("networkError");
  const [fileErrorKey, setFileErrorKey] = useState<string>();
  const [fileNoticeKey, setFileNoticeKey] = useState<string>();
  const [progressKey, setProgressKey] = useState("encrypting");
  const [supportsHwpx, setSupportsHwpx] = useState(false);
  const [supportsHwp, setSupportsHwp] = useState(false);
  const [reminderStage, setReminderStage] = useState<Stage>();
  const [helpOpen, setHelpOpen] = useState(false);
  const photoInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const text = useCallback<Text>((key, values) => translate(locale, key, values), [locale]);
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
  const speak = useCallback(
    async (keys: readonly string[]) => {
      for (const key of keys) await guide.play(key, locale);
    },
    [guide, locale],
  );

  const shutdownPage = useCallback(() => {
    guide.stop();
    // Started before the close attempt so the wipe is already under way if the
    // browser does close the tab, and `keepalive` carries the last request out.
    void clearBrowserSiteData();
    try {
      window.close();
    } catch {
      // Refusing to close is the normal case, not an error.
    }
    window.setTimeout(() => {
      if (window.closed) return;
      // Drop the session fragment so Back cannot return to the finished flow.
      history.replaceState(null, "", window.location.pathname);
      setStage("closed");
    }, CLOSE_CONFIRM_MS);
  }, [guide]);

  useEffect(() => {
    if (stage !== "complete") return;
    const timer = window.setTimeout(shutdownPage, AUTOMATIC_SHUTDOWN_MS);
    return () => window.clearTimeout(timer);
  }, [shutdownPage, stage]);

  useEffect(() => () => guide.stop(), [guide]);

  useEffect(() => {
    const timer = window.setTimeout(() => setReminderStage(stage), 30_000);
    return () => window.clearTimeout(timer);
  }, [stage]);

  // Backing out of the system file picker leaves the screen unchanged, which
  // reads as "nothing happened". Say so instead of leaving the visitor stuck.
  useEffect(() => {
    if (stage !== "file") return;
    const inputs = [photoInput.current, fileInput.current].filter(
      (input): input is HTMLInputElement => Boolean(input),
    );
    const announce = () => setFileNoticeKey("cancelled");
    for (const input of inputs) input.addEventListener("cancel", announce);
    return () => {
      for (const input of inputs) input.removeEventListener("cancel", announce);
    };
  }, [stage]);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = isRightToLeft(locale) ? "rtl" : "ltr";
  }, [locale]);

  const clearDocument = useCallback(() => {
    setValidated((current) => {
      current?.bytes.fill(0);
      return undefined;
    });
    setFile(undefined);
    setFileErrorKey(undefined);
    setFileNoticeKey(undefined);
    if (photoInput.current) photoInput.current.value = "";
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
        setSupportsHwpx(fragment.supportsHwpx);
        setSupportsHwp(fragment.supportsHwp);
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
      if (!selected) return;
      try {
        setFileErrorKey(undefined);
        setFileNoticeKey(undefined);
        const result = await validateMobileDocument(selected, {
          allowHwp: supportsHwp,
          allowHwpx: supportsHwpx,
        });
        setFile(selected);
        setValidated(result);
        setStage("preview");
      } catch (error) {
        clearDocument();
        setFileErrorKey(error instanceof FileValidationError ? error.code : "damagedFile");
      }
    },
    [clearDocument, supportsHwp, supportsHwpx],
  );

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
      : stage === "guide"
        ? 2
        : stage === "file"
          ? 3
          : stage === "preview"
            ? 4
            : 5;
  // A visitor who has stalled for 30 seconds needs a different sentence, not the
  // one already on screen, so later steps fall back to their help instruction.
  const reminderKey =
    stage === "language"
      ? "languageReminder"
      : stage === "guide"
        ? "guideReminder"
        : HELP_KEYS[stage];
  const supportsHancom = supportsHwp || supportsHwpx;

  return (
    <ScreenShell>
      <div className="mobile-topbar">
        <Wordmark compact />
        {stage === "boot" || stage === "closed" ? null : (
          <button
            type="button"
            className="mobile-help-open"
            onClick={() => setHelpOpen(true)}
            aria-haspopup="dialog"
          >
            <CircleQuestionMark aria-hidden="true" />
            {text("helpOpen")}
          </button>
        )}
      </div>
      {stage !== "boot" && stage !== "error" && stage !== "complete" ? (
        <ProgressSteps current={step} total={5} label={text("step", { current: step, total: 5 })} />
      ) : null}
      {reminderStage === stage && !["boot", "complete", "error"].includes(stage) ? (
        <p className="mobile-reminder" role="status">
          {text(reminderKey)}
        </p>
      ) : null}
      {stage === "boot" ? <Loading text={text("preparingSession")} /> : null}
      {stage === "language" ? (
        <LanguageStep locale={locale} onSelect={setLocale} onContinue={() => setStage("guide")} />
      ) : null}
      {stage === "guide" ? (
        <GuideStep
          text={text}
          supportsHancom={supportsHancom}
          onListen={() =>
            void speak(guideStepsFor(supportsHancom).flatMap(({ title, body }) => [title, body]))
          }
          onContinue={() => setStage("file")}
        />
      ) : null}
      {stage === "file" ? (
        <section className="mobile-step">
          <StatusIcon>
            <FileImage size={32} aria-hidden="true" />
          </StatusIcon>
          <h1>{text("chooseFile")}</h1>
          <p>{expandHancomLabel(text(supportsHancom ? "fileRulesHwpx" : "fileRules"))}</p>
          <input
            ref={photoInput}
            data-testid="photo-input"
            hidden
            type="file"
            accept="image/*,.heic,.heif,.webp,.avif,.bmp,.gif,.tif,.tiff"
            onChange={(event) => void chooseFile(event.target.files?.[0])}
          />
          <input
            ref={fileInput}
            data-testid="file-input"
            hidden
            type="file"
            accept="application/pdf,application/x-hwp,application/haansofthwp,application/hwp+zip,image/*,.pdf,.hwp,.hwpx,.jpg,.jpeg,.png,.heic,.heif,.webp,.avif,.bmp,.gif,.tif,.tiff"
            onChange={(event) => void chooseFile(event.target.files?.[0])}
          />
          {fileErrorKey ? (
            <p className="mobile-file-error" role="alert">
              {expandHancomLabel(text(fileErrorKey))}
            </p>
          ) : null}
          {!fileErrorKey && fileNoticeKey ? (
            <p className="mobile-file-notice" role="status">
              {text(fileNoticeKey)}
            </p>
          ) : null}
          <div className="mobile-source-actions">
            <PrimaryButton onClick={() => photoInput.current?.click()}>
              <ImageIcon aria-hidden="true" /> {text("locationPhotos")}
            </PrimaryButton>
            <SecondaryButton onClick={() => fileInput.current?.click()}>
              <Files aria-hidden="true" /> {text("locationFiles")}
            </SecondaryButton>
          </div>
        </section>
      ) : null}
      {stage === "preview" && file && validated ? (
        <section className="mobile-step mobile-step--preview">
          <h1>{text("checkDocument")}</h1>
          <p>{text("previewHelp")}</p>
          <DocumentPreview
            file={file}
            validated={validated}
            labels={{
              documentPreview: text("documentPreview"),
              selectedDocumentPreview: text("selectedDocumentPreview"),
              pdfPreview: text("pdfPreview"),
              firstPagePreview: text("firstPagePreview"),
              hwpxPreview: expandHancomLabel(text("hwpxPreview")),
            }}
          />
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
        <ProgressState text={text(progressKey)} keepPageOpen={text("keepPageOpen")} />
      ) : null}
      {stage === "complete" ? (
        <SingleAction
          icon="success"
          title={text("completed")}
          body={text("collectOutput")}
          action={text("closePage")}
          onAction={shutdownPage}
          secondaryAction={text("listenAgain")}
          onSecondaryAction={() => void speak(["collectOutput"])}
        />
      ) : null}
      {stage === "closed" ? (
        <section className="mobile-step mobile-step--single mobile-step--closed">
          <StatusIcon tone="success">
            <CheckCircle2 size={34} aria-hidden="true" />
          </StatusIcon>
          <h1>{text("closedTitle")}</h1>
          <p>{text("closedBody")}</p>
        </section>
      ) : null}
      {stage === "error" ? (
        <SingleAction
          icon="error"
          title={text(errorKey)}
          body=""
          action={text("listenAgain")}
          onAction={() => void speak([errorKey])}
        />
      ) : null}
      <HelpSheet
        open={helpOpen}
        stage={stage}
        text={text}
        onListen={() => void speak([HELP_KEYS[stage], "helpAskStaff"])}
        onClose={() => {
          guide.stop();
          setHelpOpen(false);
        }}
      />
    </ScreenShell>
  );
}

function Loading({ text }: { text: string }) {
  return (
    <section className="mobile-step" aria-busy="true">
      <div className="mobile-spinner" />
      <p>{text}</p>
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
    <section className="mobile-step mobile-step--language">
      <h1>{translate(locale, "selectLanguage")}</h1>
      <p>{translate(locale, "selectLanguageHint")}</p>
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
      <div className="mobile-language-action">
        <PrimaryButton onClick={onContinue}>{translate(locale, "continue")}</PrimaryButton>
      </div>
    </section>
  );
}

function GuideStep({
  text,
  supportsHancom,
  onContinue,
  onListen,
}: {
  text: Text;
  supportsHancom: boolean;
  onContinue: () => void;
  onListen: () => void;
}) {
  return (
    <section className="mobile-step mobile-step--guide">
      <div className="mobile-guide__heading">
        <h1>{text("guideTitle")}</h1>
        <p>{text("guideIntro")}</p>
      </div>
      <ol className="mobile-guide" aria-label={text("guideTitle")}>
        {guideStepsFor(supportsHancom).map(({ icon: Icon, title, body, completed }) => (
          <li key={title} className={completed ? "is-complete" : undefined}>
            <span className="mobile-guide__icon" aria-hidden="true">
              <Icon />
              {completed ? <CheckCircle2 className="mobile-guide__check" /> : null}
            </span>
            <span>
              <strong>{text(title)}</strong>
              <small>{expandHancomLabel(text(body))}</small>
            </span>
          </li>
        ))}
      </ol>
      <PrimaryButton onClick={onContinue}>{text("guideStart")}</PrimaryButton>
      <SecondaryButton className="mobile-listen" onClick={onListen}>
        <Volume2 aria-hidden="true" /> {text("guideListen")}
      </SecondaryButton>
    </section>
  );
}

function HelpSheet({
  open,
  stage,
  text,
  onClose,
  onListen,
}: {
  open: boolean;
  stage: Stage;
  text: Text;
  onClose: () => void;
  onListen: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const node = dialog.current;
    if (!node) return;
    if (open && !node.open) node.showModal();
    if (!open && node.open) node.close();
  }, [open]);

  // Showing where a document usually hides only helps before one is chosen.
  const showFileLocations = stage === "guide" || stage === "file";

  return (
    <dialog
      ref={dialog}
      className="mobile-help"
      onClose={onClose}
      aria-labelledby="mobile-help-title"
    >
      {/* Rendered only while open so closed help text never reaches a screen
          reader, a translation tool, or the visible screen behind the sheet. */}
      {open ? (
        <>
          <h2 id="mobile-help-title">{text("helpTitle")}</h2>
          <p className="mobile-help__now">{text(HELP_KEYS[stage])}</p>
          {showFileLocations ? (
            <div className="mobile-help__where">
              <h3>{text("chooseLocation")}</h3>
              <ul>
                <li>
                  <MessageCircle aria-hidden="true" />
                  <span>
                    <strong>{text("locationKakao")}</strong>
                    <small>{text("kakaoGuide")}</small>
                  </span>
                </li>
                <li>
                  <Mail aria-hidden="true" />
                  <span>
                    <strong>{text("locationEmail")}</strong>
                    <small>{text("emailGuide")}</small>
                  </span>
                </li>
                <li>
                  <Ban aria-hidden="true" />
                  <span>
                    <strong>{text("locationMissing")}</strong>
                    <small>
                      {text("missingTitle")} {text("missingBody")}
                    </small>
                  </span>
                </li>
              </ul>
            </div>
          ) : null}
          <p className="mobile-help__staff">{text("helpAskStaff")}</p>
          <div className="mobile-help__actions">
            <PrimaryButton onClick={onClose}>{text("helpClose")}</PrimaryButton>
            <SecondaryButton onClick={onListen}>
              <Volume2 aria-hidden="true" /> {text("guideListen")}
            </SecondaryButton>
          </div>
        </>
      ) : null}
    </dialog>
  );
}

function SingleAction({
  icon = "info",
  title,
  body,
  action,
  onAction,
  secondaryAction,
  onSecondaryAction,
}: {
  icon?: "info" | "success" | "error";
  title: string;
  body: string;
  action: string;
  onAction: () => void;
  secondaryAction?: string;
  onSecondaryAction?: () => void;
}) {
  const Icon = icon === "success" ? CheckCircle2 : icon === "error" ? TriangleAlert : Headphones;
  return (
    <section className="mobile-step mobile-step--single">
      <StatusIcon tone={icon}>
        <Icon size={34} aria-hidden="true" />
      </StatusIcon>
      <h1>{title}</h1>
      {body ? <p>{body}</p> : null}
      <PrimaryButton onClick={onAction}>
        {secondaryAction ? <X aria-hidden="true" /> : <Volume2 aria-hidden="true" />} {action}
      </PrimaryButton>
      {secondaryAction && onSecondaryAction ? (
        <SecondaryButton className="mobile-listen" onClick={onSecondaryAction}>
          <Volume2 aria-hidden="true" /> {secondaryAction}
        </SecondaryButton>
      ) : null}
    </section>
  );
}

function ProgressState({ text, keepPageOpen }: { text: string; keepPageOpen: string }) {
  return (
    <section className="mobile-step mobile-step--single" aria-live="polite">
      <div className="mobile-spinner" />
      <h1>{text}</h1>
      <p>{keepPageOpen}</p>
    </section>
  );
}

function expandHancomLabel(value: string): string {
  return value.replaceAll("HWPX", "HWP/HWPX");
}
