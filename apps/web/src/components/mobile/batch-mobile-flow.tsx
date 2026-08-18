"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  CircleQuestionMark,
  FileImage,
  Files,
  Image as ImageIcon,
  Languages,
  LockKeyhole,
  Printer,
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
  MAX_PRINT_BUNDLE_BYTES,
  MAX_PRINT_BUNDLE_FILES,
  encodePrintBundle,
  printBundleEncodedSize,
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
import { useVisitorLocale } from "@/lib/use-visitor-locale";

import { DocumentPreview } from "./document-preview";
import { formatBatchCopy, printBatchCopy, type PrintBatchCopy } from "./print-batch-copy";

type Stage =
  "boot" | "file" | "preview" | "transfer" | "progress" | "complete" | "closed" | "error";
type ClaimedSession = Awaited<ReturnType<typeof claimSession>>;
type SelectedDocument = { file: File; validated: ValidatedMobileFile };

const CLOSE_CONFIRM_MS = 150;
const AUTOMATIC_SHUTDOWN_MS = 30_000;

export function BatchMobileFlow({
  sessionId,
  initialLocale,
}: {
  sessionId: string;
  initialLocale?: SupportedLocale;
}) {
  const [locale, setLocale, text] = useVisitorLocale(initialLocale);
  const copy = printBatchCopy(locale);
  const [stage, setStage] = useState<Stage>("boot");
  const [claimed, setClaimed] = useState<ClaimedSession>();
  const [mobileToken, setMobileToken] = useState("");
  const [documents, setDocuments] = useState<SelectedDocument[]>([]);
  const [errorKey, setErrorKey] = useState("networkError");
  const [fileErrorKey, setFileErrorKey] = useState<string>();
  const [batchError, setBatchError] = useState<string>();
  const [fileNoticeKey, setFileNoticeKey] = useState<string>();
  const [progressKey, setProgressKey] = useState("encrypting");
  const [watching, setWatching] = useState<PrintWatchState>({ kind: "waiting" });
  const [supportsHwpx, setSupportsHwpx] = useState(false);
  const [supportsHwp, setSupportsHwp] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const photoInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const watchAbort = useRef<AbortController>(null);

  const clearDocuments = useCallback(() => {
    setDocuments((current) => {
      for (const item of current) item.validated.bytes.fill(0);
      return [];
    });
    setFileErrorKey(undefined);
    setBatchError(undefined);
    setFileNoticeKey(undefined);
    if (photoInput.current) photoInput.current.value = "";
    if (fileInput.current) fileInput.current.value = "";
  }, []);

  const shutdownPage = useCallback(() => {
    void clearBrowserSiteData();
    try {
      window.close();
    } catch {
      // A tab opened by scanning is usually not script-closeable.
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
        const response = await claimSession({
          sessionId,
          uploadToken: fragment.uploadToken,
          mobileTokenHash: await hashToken(nextMobileToken, "mobile"),
          claimIdHash: await hashToken(generateToken(), "mobile"),
        });
        const computed = await fingerprintPublicKey(response.kioskPublicKey);
        if (
          !timingSafeEqual(fromBase64Url(computed), fromBase64Url(fragment.fingerprint)) ||
          response.kioskPublicKeyFingerprint !== fragment.fingerprint
        ) {
          await cancelSession(sessionId, nextMobileToken).catch(() => undefined);
          throw new Error("fingerprintMismatch");
        }
        if (!active) return;
        setClaimed(response);
        setMobileToken(nextMobileToken);
        history.replaceState(null, "", `${window.location.pathname}#claimed`);
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
    async (incoming: FileList | null) => {
      if (!incoming || incoming.length === 0) return;
      const files = Array.from(incoming);
      setFileErrorKey(undefined);
      setBatchError(undefined);
      setFileNoticeKey(undefined);
      if (files.length > MAX_PRINT_BUNDLE_FILES) {
        setBatchError(copy.tooManyFiles);
        return;
      }

      const next: SelectedDocument[] = [];
      try {
        for (const file of files) {
          const validated = await validateMobileDocument(file, {
            allowHwp: supportsHwp,
            allowHwpx: supportsHwpx,
          });
          next.push({ file, validated });
        }
        if (
          next.length > 1 &&
          printBundleEncodedSize(next.map(({ validated }) => ({ bytes: validated.bytes }))) >
            MAX_PRINT_BUNDLE_BYTES
        ) {
          throw new BatchSelectionError(copy.batchTooLarge);
        }
        clearDocuments();
        setDocuments(next);
        setStage("preview");
      } catch (error) {
        for (const item of next) item.validated.bytes.fill(0);
        if (error instanceof BatchSelectionError) setBatchError(error.message);
        else setFileErrorKey(error instanceof FileValidationError ? error.code : "damagedFile");
      }
    },
    [clearDocuments, copy.batchTooLarge, copy.tooManyFiles, supportsHwp, supportsHwpx],
  );

  const cancelClaim = useCallback(async () => {
    if (mobileToken) await cancelSession(sessionId, mobileToken).catch(() => undefined);
    clearDocuments();
    setClaimed(undefined);
    setMobileToken("");
  }, [clearDocuments, mobileToken, sessionId]);

  const print = useCallback(async () => {
    if (!claimed || documents.length === 0 || !mobileToken) return;
    let envelope: Uint8Array | undefined;
    let bundle: Uint8Array | undefined;
    try {
      setStage("transfer");
      setProgressKey("encrypting");
      const first = documents[0];
      if (!first) throw new Error("empty selection");
      const fileKind =
        documents.length === 1 ? printableKind(first.validated.fileKind) : ("bundle" as const);
      const plaintext =
        documents.length === 1
          ? first.validated.bytes
          : (bundle = encodePrintBundle(
              documents.map(({ validated }) => ({
                fileKind: printableKind(validated.fileKind),
                bytes: validated.bytes,
              })),
            ));
      envelope = await encryptDocument({
        plaintext,
        fileKind,
        kioskPublicKey: claimed.kioskPublicKey,
        context: {
          protocolVersion: 1,
          sessionId,
          kioskPublicKeyFingerprint: claimed.kioskPublicKeyFingerprint,
        },
      });
      const authorization = await authorizeUpload(
        sessionId,
        mobileToken,
        await hashToken(generateToken(), "mobile"),
      );
      await startUpload(sessionId, mobileToken);
      setProgressKey("uploading");
      await completeUpload(sessionId, mobileToken, await uploadCiphertext(authorization, envelope));
    } catch (error) {
      await cancelClaim();
      setErrorKey(
        error instanceof ApiClientError && error.status === 410 ? "expiredQr" : "networkError",
      );
      setStage("error");
      return;
    } finally {
      bundle?.fill(0);
      envelope?.fill(0);
    }

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
    clearDocuments();
    setClaimed(undefined);
    setMobileToken("");
    if (outcome.kind === "completed") {
      setStage("complete");
      return;
    }
    if (outcome.kind === "failed") {
      setErrorKey(outcome.reason === "sessionExpired" ? "expiredQr" : "printFailed");
      setStage("error");
      return;
    }
    setErrorKey("printOutcomeUnknown");
    setStage("error");
  }, [cancelClaim, claimed, clearDocuments, documents, mobileToken, sessionId]);

  const step = stage === "file" ? 1 : stage === "preview" ? 2 : 3;
  const supportsHancom = supportsHwp || supportsHwpx;
  const hancomLabel = hancomFormatLabel(supportsHwp, supportsHwpx);
  const rules = (supportsHancom ? copy.rulesHancom : copy.rules).replaceAll(
    "HWP/HWPX",
    hancomLabel,
  );

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
              onClick={() => setHelpOpen((v) => !v)}
            >
              <CircleQuestionMark aria-hidden="true" /> {text("helpOpen")}
            </button>
          </div>
        )}
      </div>

      {stage !== "boot" && stage !== "error" && stage !== "complete" && stage !== "closed" ? (
        <ProgressSteps current={step} total={3} label={text("step", { current: step, total: 3 })} />
      ) : null}

      {helpOpen && (stage === "file" || stage === "preview") ? (
        <div className="mobile-file-notice" role="status">
          {stage === "file" ? copy.helpFile : copy.helpPreview}
        </div>
      ) : null}

      {stage === "boot" ? <ProgressState text={text("preparingSession")} note="" /> : null}

      {stage === "file" ? (
        <section className="mobile-step">
          <StatusIcon>
            <FileImage size={32} aria-hidden="true" />
          </StatusIcon>
          <h1>{copy.chooseFiles}</h1>
          <p>{rules}</p>
          <input
            ref={photoInput}
            data-testid="photo-input"
            hidden
            multiple
            type="file"
            accept="image/*,.heic,.heif,.webp,.avif,.bmp,.gif,.tif,.tiff"
            onChange={(event) => void chooseFiles(event.target.files)}
          />
          <input
            ref={fileInput}
            data-testid="file-input"
            hidden
            multiple
            type="file"
            accept={documentAccept(supportsHwp, supportsHwpx)}
            onChange={(event) => void chooseFiles(event.target.files)}
          />
          {batchError ? (
            <p className="mobile-file-error" role="alert">
              {batchError}
            </p>
          ) : fileErrorKey ? (
            <p className="mobile-file-error" role="alert">
              {text(fileErrorKey)}
            </p>
          ) : fileNoticeKey ? (
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

      {stage === "preview" && documents.length > 0 ? (
        <section className="mobile-step mobile-step--preview">
          <h1>{copy.checkFiles}</h1>
          <p>{copy.previewHelp}</p>
          {documents.length === 1 && documents[0] ? (
            <DocumentPreview
              file={documents[0].file}
              validated={documents[0].validated}
              labels={{
                documentPreview: text("documentPreview"),
                selectedDocumentPreview: text("selectedDocumentPreview"),
                pdfPreview: text("pdfPreview"),
                firstPagePreview: text("firstPagePreview"),
                hwpxPreview: text("hwpxPreview").replaceAll("HWPX", hancomLabel),
              }}
            />
          ) : (
            <ul className="drop-file-list">
              {documents.map(({ file, validated }, index) => (
                <li key={`${file.name}-${file.size}-${file.lastModified}-${index}`}>
                  <span className="drop-file-list__name">
                    {index + 1}. {file.name}
                  </span>
                  <span className="drop-file-list__size">{documentSummary(validated)}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="mobile-file-notice" role="status">
            {formatBatchCopy(copy.selected, documents.length)}
          </p>
          <div className="mobile-summary">
            <p>
              <Printer aria-hidden="true" /> {text("printSummary")}
            </p>
            <p>
              <LockKeyhole aria-hidden="true" /> {text("privacySummary")}
            </p>
          </div>
          <PrimaryButton onClick={() => void print()}>
            <Printer aria-hidden="true" /> {formatBatchCopy(copy.printFiles, documents.length)}
          </PrimaryButton>
          <SecondaryButton
            onClick={() => {
              clearDocuments();
              setStage("file");
            }}
          >
            {copy.changeSelection}
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
        <SingleAction icon="success" title={text("closedTitle")} body={text("closedBody")} />
      ) : null}
      {stage === "error" ? (
        <SingleAction
          icon={errorKey === "printOutcomeUnknown" ? "info" : "error"}
          title={text(errorKey)}
          body={errorKey === "printOutcomeUnknown" ? text("printOutcomeUnknownBody") : ""}
        />
      ) : null}
    </ScreenShell>
  );
}

function printableKind(kind: ValidatedMobileFile["fileKind"]): PrintableFileKind {
  if (kind === "bundle") throw new Error("A selected document cannot itself be a print bundle");
  return kind;
}

function documentSummary(validated: ValidatedMobileFile): string {
  if (validated.fileKind === "pdf") return `PDF · ${validated.pageCount}p`;
  if (validated.fileKind === "hwp") return "HWP";
  if (validated.fileKind === "hwpx") return "HWPX";
  if (validated.fileKind === "bundle") return "";
  return "Photo · 1p";
}

function ProgressState({ text, note }: { text: string; note: string }) {
  return (
    <section className="mobile-step mobile-step--single" aria-live="polite">
      <div className="mobile-spinner" />
      <h1>{text}</h1>
      {note ? <p>{note}</p> : null}
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

function hancomFormatLabel(supportsHwp: boolean, supportsHwpx: boolean): string {
  if (supportsHwp === supportsHwpx) return "HWP/HWPX";
  return supportsHwp ? "HWP" : "HWPX";
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

class BatchSelectionError extends Error {}
