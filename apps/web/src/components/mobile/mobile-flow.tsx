"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Ban,
  CheckCircle2,
  CircleQuestionMark,
  FileCheck2,
  FileImage,
  Files,
  Image as ImageIcon,
  Languages,
  LockKeyhole,
  Mail,
  MessageCircle,
  Printer,
  ScanLine,
  Send,
  TriangleAlert,
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
import { LOCALE_NAMES, SUPPORTED_LOCALES, type SupportedLocale } from "@print-cess/i18n";
import {
  MAX_PLAINTEXT_BYTES,
  MAX_PRINT_BUNDLE_FILES,
  encodePrintBundle,
  printBundleEncodedBytes,
  type PrintableFileKind,
} from "@print-cess/protocol";
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
import {
  FileValidationError,
  validateMobileDocument,
  type ValidatedMobileFile,
} from "@/lib/mobile-document-validation";
import { watchPrintStatus, type PrintWatchState } from "@/lib/print-status";
import { parseSessionFragment } from "@/lib/session-fragment";
import { clearBrowserSiteData } from "@/lib/session-teardown";
import { useVisitorLocale, type Text } from "@/lib/use-visitor-locale";
import { DocumentPreview } from "./document-preview";

type Stage =
  "boot" | "file" | "preview" | "transfer" | "progress" | "complete" | "closed" | "error";

type ClaimedSession = Awaited<ReturnType<typeof claimSession>>;
type SelectedDocument = { file: File; validated: ValidatedMobileFile };

const HELP_KEYS: Record<Stage, string> = {
  boot: "helpProgress",
  file: "helpFile",
  preview: "helpPreview",
  transfer: "helpProgress",
  progress: "helpProgress",
  complete: "helpDone",
  closed: "helpDone",
  error: "helpError",
};

const CLOSE_CONFIRM_MS = 150;
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

export function MobileFlow({
  sessionId,
  initialLocale,
}: {
  sessionId: string;
  initialLocale?: SupportedLocale;
}) {
  const [locale, setLocale, text] = useVisitorLocale(initialLocale);
  const [stage, setStage] = useState<Stage>("boot");
  const [claimed, setClaimed] = useState<ClaimedSession>();
  const [mobileToken, setMobileToken] = useState("");
  const [documents, setDocuments] = useState<SelectedDocument[]>([]);
  const [errorKey, setErrorKey] = useState("networkError");
  const [fileErrorKey, setFileErrorKey] = useState<string>();
  const [fileNoticeKey, setFileNoticeKey] = useState<string>();
  const [progressKey, setProgressKey] = useState("encrypting");
  const [watching, setWatching] = useState<PrintWatchState>({ kind: "waiting" });
  const [supportsHwpx, setSupportsHwpx] = useState(false);
  const [supportsHwp, setSupportsHwp] = useState(false);
  const [supportsBundle, setSupportsBundle] = useState(false);
  const [reminderStage, setReminderStage] = useState<Stage>();
  const [helpOpen, setHelpOpen] = useState(false);
  const photoInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const watchAbort = useRef<AbortController>(null);

  const shutdownPage = useCallback(() => {
    void clearBrowserSiteData();
    try {
      window.close();
    } catch {
      // Refusing to close is the normal browser case.
    }
    window.setTimeout(() => {
      if (window.closed) return;
      history.replaceState(null, "", window.location.pathname);
      setStage("closed");
    }, CLOSE_CONFIRM_MS);
  }, []);

  useEffect(() => {
    if (stage !== "complete") return;
    const timer = window.setTimeout(shutdownPage, AUTOMATIC_SHUTDOWN_MS);
    return () => window.clearTimeout(timer);
  }, [shutdownPage, stage]);

  useEffect(() => {
    const timer = window.setTimeout(() => setReminderStage(stage), 30_000);
    return () => window.clearTimeout(timer);
  }, [stage]);

  useEffect(() => () => watchAbort.current?.abort(), []);

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

  const clearDocuments = useCallback(() => {
    setDocuments((current) => {
      for (const document of current) document.validated.bytes.fill(0);
      return [];
    });
    setFileErrorKey(undefined);
    setFileNoticeKey(undefined);
    if (photoInput.current) photoInput.current.value = "";
    if (fileInput.current) fileInput.current.value = "";
  }, []);

  const cancelClaim = useCallback(async () => {
    if (mobileToken) {
      await cancelSession(sessionId, mobileToken).catch(() => undefined);
    }
    clearDocuments();
    setClaimed(undefined);
    setMobileToken("");
  }, [clearDocuments, mobileToken, sessionId]);

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
        setSupportsBundle(fragment.supportsBundle);
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
        setStage("file");
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

  const chooseFiles = useCallback(
    async (selection: FileList | readonly File[] | null | undefined) => {
      const selected = Array.from(selection ?? []);
      if (selected.length === 0) return;
      if (selected.length > 1 && !supportsBundle) {
        setFileErrorKey("unsupportedType");
        return;
      }
      if (selected.length > MAX_PRINT_BUNDLE_FILES) {
        setFileErrorKey("dropTooManyFiles");
        return;
      }

      const next: SelectedDocument[] = [];
      try {
        setFileErrorKey(undefined);
        setFileNoticeKey(undefined);
        for (const file of selected) {
          const validated = await validateMobileDocument(file, {
            allowHwp: supportsHwp,
            allowHwpx: supportsHwpx,
          });
          next.push({ file, validated });
        }
        if (
          next.length > 1 &&
          printBundleEncodedBytes(next.map((item) => item.validated)) > MAX_PLAINTEXT_BYTES
        ) {
          throw new FileValidationError("tooLarge");
        }
        clearDocuments();
        setDocuments(next);
        setStage("preview");
      } catch (error) {
        for (const document of next) document.validated.bytes.fill(0);
        clearDocuments();
        setFileErrorKey(error instanceof FileValidationError ? error.code : "damagedFile");
      }
    },
    [clearDocuments, supportsBundle, supportsHwp, supportsHwpx],
  );

  const print = useCallback(async () => {
    if (!claimed || documents.length === 0 || !mobileToken) return;
    let envelope: Uint8Array | undefined;
    let bundle: Uint8Array | undefined;
    let committed = false;
    try {
      setStage("transfer");
      setProgressKey("encrypting");
      const single = documents.length === 1 ? documents[0] : undefined;
      if (!single) {
        if (!supportsBundle) throw new Error("bundle capability is unavailable");
        bundle = encodePrintBundle(
          documents.map(({ validated }) => ({
            fileKind: printableKind(validated),
            bytes: validated.bytes,
          })),
        );
      }
      envelope = await encryptDocument({
        plaintext: single?.validated.bytes ?? bundle!,
        fileKind: single?.validated.fileKind ?? "bundle",
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
      committed = true;
    } catch (error) {
      await cancelClaim();
      setErrorKey(
        error instanceof ApiClientError && error.status === 410 ? "expiredQr" : "networkError",
      );
      setStage("error");
      return;
    } finally {
      envelope?.fill(0);
      bundle?.fill(0);
    }

    if (!committed) return;
    setProgressKey("waitingForPrint");
    setStage("progress");
    const controller = new AbortController();
    watchAbort.current = controller;
    const outcome = await watchPrintStatus({
      poll: () => getMobileStatus(sessionId, mobileToken),
      onState: setWatching,
      signal: controller.signal,
    });
    watchAbort.current = null;
    if (outcome.kind === "completed") {
      clearDocuments();
      setClaimed(undefined);
      setMobileToken("");
      setStage("complete");
      return;
    }
    if (outcome.kind === "failed") {
      clearDocuments();
      setClaimed(undefined);
      setMobileToken("");
      setErrorKey(outcome.reason === "sessionExpired" ? "expiredQr" : "printFailed");
      setStage("error");
      return;
    }
    clearDocuments();
    setClaimed(undefined);
    setMobileToken("");
    setErrorKey("printOutcomeUnknown");
    setStage("error");
  }, [cancelClaim, claimed, clearDocuments, documents, mobileToken, sessionId, supportsBundle]);

  const step = stage === "file" ? 1 : stage === "preview" ? 2 : 3;
  const reminderKey = HELP_KEYS[stage];
  const supportsHancom = supportsHwp || supportsHwpx;
  const hancomLabel = hancomFormatLabel(supportsHwp, supportsHwpx);
  const naming = (value: string) => applyHancomLabel(value, hancomLabel);

  return (
    <ScreenShell>
      <div className="mobile-topbar">
        <Wordmark compact />
        {stage === "boot" || stage === "closed" ? null : (
          <div className="mobile-topbar__actions">
            <label className="drop-language">
              <Languages aria-hidden="true" />
              <span className="drop-visually-hidden">{text("selectLanguage")}</span>
              <select
                value={locale}
                onChange={(event) => setLocale(event.target.value as SupportedLocale)}
              >
                {SUPPORTED_LOCALES.map((candidate) => (
                  <option key={candidate} value={candidate}>
                    {LOCALE_NAMES[candidate]}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="mobile-help-open"
              onClick={() => setHelpOpen(true)}
              aria-haspopup="dialog"
            >
              <CircleQuestionMark aria-hidden="true" />
              {text("helpOpen")}
            </button>
          </div>
        )}
      </div>
      {stage !== "boot" && stage !== "error" && stage !== "complete" && stage !== "closed" ? (
        <ProgressSteps current={step} total={3} label={text("step", { current: step, total: 3 })} />
      ) : null}
      {reminderStage === stage && !["boot", "complete", "error", "closed"].includes(stage) ? (
        <p className="mobile-reminder" role="status">
          {text(reminderKey)}
        </p>
      ) : null}
      {stage === "boot" ? <Loading text={text("preparingSession")} /> : null}
      {stage === "file" ? (
        <section className="mobile-step">
          <StatusIcon>
            <FileImage size={32} aria-hidden="true" />
          </StatusIcon>
          <h1>
            {locale === "ko" && supportsBundle
              ? "인쇄할 파일을 고르세요"
              : locale === "en" && supportsBundle
                ? "Pick files to print"
                : text("chooseFile")}
          </h1>
          <p>
            {supportsBundle
              ? locale === "ko"
                ? `사진과 문서를 섞어서 한 번에 최대 ${MAX_PRINT_BUNDLE_FILES}개까지 선택할 수 있습니다.`
                : locale === "en"
                  ? `Choose up to ${MAX_PRINT_BUNDLE_FILES} photos and documents together.`
                  : naming(text(supportsHancom ? "fileRulesHwpx" : "fileRules"))
              : naming(text(supportsHancom ? "fileRulesHwpx" : "fileRules"))}
          </p>
          <input
            ref={photoInput}
            data-testid="photo-input"
            hidden
            type="file"
            multiple={supportsBundle}
            accept="image/*,.heic,.heif,.webp,.avif,.bmp,.gif,.tif,.tiff"
            onChange={(event) => void chooseFiles(event.target.files)}
          />
          <input
            ref={fileInput}
            data-testid="file-input"
            hidden
            type="file"
            multiple={supportsBundle}
            accept={documentAccept(supportsHwp, supportsHwpx)}
            onChange={(event) => void chooseFiles(event.target.files)}
          />
          {fileErrorKey ? (
            <p className="mobile-file-error" role="alert">
              {naming(text(fileErrorKey))}
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
          <button type="button" className="mobile-guide-link" onClick={() => setHelpOpen(true)}>
            {text("guideOpen")}
          </button>
        </section>
      ) : null}
      {stage === "preview" && documents.length > 0 ? (
        <section className="mobile-step mobile-step--preview">
          <h1>{text("checkDocument")}</h1>
          <p>{text("previewHelp")}</p>
          <div className="mobile-preview-stack" data-testid="selected-print-files">
            {documents.map(({ file, validated }, index) => (
              <article className="mobile-preview-item" key={`${file.name}-${file.size}-${index}`}>
                {documents.length > 1 ? (
                  <p className="mobile-preview-item__label">
                    <strong>{index + 1}</strong> / {documents.length} · {file.name}
                  </p>
                ) : null}
                <DocumentPreview
                  file={file}
                  validated={validated}
                  labels={{
                    documentPreview: text("documentPreview"),
                    selectedDocumentPreview: text("selectedDocumentPreview"),
                    pdfPreview: text("pdfPreview"),
                    firstPagePreview: text("firstPagePreview"),
                    hwpxPreview: naming(text("hwpxPreview")),
                  }}
                />
              </article>
            ))}
          </div>
          <div className="mobile-summary">
            <p>
              <Printer aria-hidden="true" /> {documents.length > 1 ? `${documents.length} × ` : ""}
              {text("printSummary")}
            </p>
            <p>
              <LockKeyhole aria-hidden="true" /> {text("privacySummary")}
            </p>
          </div>
          <PrimaryButton onClick={() => void print()}>
            <Printer aria-hidden="true" /> {text("printOneCopy")}
            {documents.length > 1 ? ` × ${documents.length}` : ""}
          </PrimaryButton>
          <SecondaryButton
            onClick={() => {
              clearDocuments();
              setStage("file");
            }}
          >
            {text("chooseAnother")}
          </SecondaryButton>
        </section>
      ) : null}
      {stage === "transfer" ? (
        <ProgressState text={text(progressKey)} note={text("keepPageOpen")} />
      ) : null}
      {stage === "progress" ? (
        <ProgressState
          text={text(watching.kind === "reconnecting" ? "reconnecting" : progressKey)}
          note={text(watching.kind === "reconnecting" ? "kioskMayStillBePrinting" : "keepPageOpen")}
        />
      ) : null}
      {stage === "complete" ? (
        <SingleAction
          icon="success"
          title={text("completed")}
          body={text("collectOutput")}
          action={text("closePage")}
          onAction={shutdownPage}
        />
      ) : null}
      {stage === "closed" ? (
        <section className="mobile-step mobile-step--single mobile-step--closed">
          <StatusIcon tone="success">
            <CheckCircle2 size={34} aria-hidden="true" />
          </StatusIcon>
          <h1>{text("closedTitle")}</h1>
          <p>{text("closedBody")}</p>
          <a className="mobile-drop-link" href="/send">
            <Send aria-hidden="true" /> {text("dropTitle")}
          </a>
        </section>
      ) : null}
      {stage === "error" ? (
        <SingleAction
          icon={errorKey === "printOutcomeUnknown" ? "info" : "error"}
          title={text(errorKey)}
          body={errorKey === "printOutcomeUnknown" ? text("printOutcomeUnknownBody") : ""}
        />
      ) : null}
      <HelpSheet
        open={helpOpen}
        stage={stage}
        text={text}
        supportsHancom={supportsHancom}
        hancomLabel={hancomLabel}
        onClose={() => setHelpOpen(false)}
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

function HelpSheet({
  open,
  stage,
  text,
  supportsHancom,
  hancomLabel,
  onClose,
}: {
  open: boolean;
  stage: Stage;
  text: Text;
  supportsHancom: boolean;
  hancomLabel: string;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const node = dialog.current;
    if (!node) return;
    if (open && !node.open) node.showModal();
    if (!open && node.open) node.close();
  }, [open]);

  const showFileLocations = stage === "file";

  return (
    <dialog
      ref={dialog}
      className="mobile-help"
      onClose={onClose}
      aria-labelledby="mobile-help-title"
    >
      {open ? (
        <>
          <h2 id="mobile-help-title">{text("helpTitle")}</h2>
          <p className="mobile-help__now">{text(HELP_KEYS[stage])}</p>
          <ol className="mobile-guide" aria-label={text("guideTitle")}>
            {guideStepsFor(supportsHancom).map(({ icon: Icon, title, body, completed }) => (
              <li key={title} className={completed ? "is-complete" : undefined}>
                <span className="mobile-guide__icon" aria-hidden="true">
                  <Icon />
                  {completed ? <CheckCircle2 className="mobile-guide__check" /> : null}
                </span>
                <span>
                  <strong>{text(title)}</strong>
                  <small>{applyHancomLabel(text(body), hancomLabel)}</small>
                </span>
              </li>
            ))}
          </ol>
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
}: {
  icon?: "info" | "success" | "error";
  title: string;
  body: string;
  action?: string;
  onAction?: () => void;
}) {
  const Icon =
    icon === "success" ? CheckCircle2 : icon === "error" ? TriangleAlert : CircleQuestionMark;
  return (
    <section className="mobile-step mobile-step--single">
      <StatusIcon tone={icon}>
        <Icon size={34} aria-hidden="true" />
      </StatusIcon>
      <h1>{title}</h1>
      {body ? <p>{body}</p> : null}
      {action && onAction ? (
        <PrimaryButton onClick={onAction}>
          <X aria-hidden="true" /> {action}
        </PrimaryButton>
      ) : null}
    </section>
  );
}

function ProgressState({ text, note }: { text: string; note: string }) {
  return (
    <section className="mobile-step mobile-step--single" aria-live="polite">
      <div className="mobile-spinner" />
      <h1>{text}</h1>
      <p>{note}</p>
    </section>
  );
}

function printableKind(validated: ValidatedMobileFile): PrintableFileKind {
  if (validated.fileKind === "bundle") throw new Error("Nested print bundles are not supported");
  return validated.fileKind;
}

function hancomFormatLabel(supportsHwp: boolean, supportsHwpx: boolean): string {
  if (supportsHwp === supportsHwpx) return "HWP/HWPX";
  return supportsHwp ? "HWP" : "HWPX";
}

function applyHancomLabel(value: string, label: string): string {
  return value.replaceAll("HWPX", label);
}

function documentAccept(supportsHwp: boolean, supportsHwpx: boolean): string {
  const base = [
    "application/pdf",
    ".pdf",
    "image/*",
    ".jpg",
    ".jpeg",
    ".png",
    ".heic",
    ".heif",
    ".webp",
    ".avif",
    ".bmp",
    ".gif",
    ".tif",
    ".tiff",
  ];
  const hancom: string[] = [];
  if (supportsHwp) hancom.push("application/x-hwp", "application/haansofthwp", ".hwp");
  if (supportsHwpx) hancom.push("application/hwp+zip", ".hwpx");
  return [...base, ...hancom].join(",");
}
