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

/**
 * The printing flow, in the order a visitor experiences it.
 *
 * There is no language screen and no guide screen. Both used to stand between
 * scanning a code and choosing a document — two screens and two taps spent
 * before the visitor saw the thing they came to do, one of them asking a
 * question their own browser had already answered. The language picker lives in
 * the header now, and the guide lives in Help, where a first-time visitor can
 * reach it and everyone else can walk past it.
 */
type Stage =
  "boot" | "file" | "preview" | "transfer" | "progress" | "complete" | "closed" | "error";

type ClaimedSession = Awaited<ReturnType<typeof claimSession>>;

// One short instruction per screen, written for a visitor who has never used a
// kiosk before. The help sheet reads from this map.
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
  const [file, setFile] = useState<File>();
  const [validated, setValidated] = useState<ValidatedMobileFile>();
  const [errorKey, setErrorKey] = useState("networkError");
  const [fileErrorKey, setFileErrorKey] = useState<string>();
  const [fileNoticeKey, setFileNoticeKey] = useState<string>();
  const [progressKey, setProgressKey] = useState("encrypting");
  const [watching, setWatching] = useState<PrintWatchState>({ kind: "waiting" });
  const [supportsHwpx, setSupportsHwpx] = useState(false);
  const [supportsHwp, setSupportsHwp] = useState(false);
  const [reminderStage, setReminderStage] = useState<Stage>();
  const [helpOpen, setHelpOpen] = useState(false);
  const photoInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const watchAbort = useRef<AbortController>(null);

  const shutdownPage = useCallback(() => {
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

  // Claiming lands straight on the file chooser. Everything the visitor needed
  // to be told before is either already true (their language) or available on
  // demand (the guide), so neither costs them a screen.
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
    // Everything up to this point is the phone's to undo. Past it, the document
    // is in the kiosk's hands and cancelling would take back a job that may
    // already be on its way to paper.
    let committed = false;
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
    }

    if (!committed) return;
    // From here the phone is a status display, nothing more. A poll that fails
    // means this phone lost the service, which says nothing at all about the
    // printer — so it never cancels, and it never invents a verdict.
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
      clearDocument();
      setClaimed(undefined);
      setMobileToken("");
      setStage("complete");
      return;
    }
    if (outcome.kind === "failed") {
      clearDocument();
      setClaimed(undefined);
      setMobileToken("");
      setErrorKey(outcome.reason === "sessionExpired" ? "expiredQr" : "printFailed");
      setStage("error");
      return;
    }
    // Neither success nor failure is known. Say exactly that, and point at the
    // only place the answer actually exists.
    clearDocument();
    setClaimed(undefined);
    setMobileToken("");
    setErrorKey("printOutcomeUnknown");
    setStage("error");
  }, [cancelClaim, claimed, clearDocument, mobileToken, sessionId, validated]);

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
            {/* The language was answered from the browser. This is here for the
                times that answer is wrong, not as a question to be asked. */}
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
          <h1>{text("chooseFile")}</h1>
          <p>{naming(text(supportsHancom ? "fileRulesHwpx" : "fileRules"))}</p>
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
            accept={documentAccept(supportsHwp, supportsHwpx)}
            onChange={(event) => void chooseFile(event.target.files?.[0])}
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
          {/* The guide that used to block this screen is one tap away, for the
              visitor who wants it and nobody else. */}
          <button type="button" className="mobile-guide-link" onClick={() => setHelpOpen(true)}>
            {text("guideOpen")}
          </button>
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
              hwpxPreview: naming(text("hwpxPreview")),
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
          {/* The visit is over and the page carries nothing from it. A quiet
              link to the other half of the service is useful here, where it
              interrupts nothing the visitor came to do. */}
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

/**
 * Everything a first-time visitor used to be shown before they could start,
 * now available whenever they want it and never in the way. The four steps of
 * the guide live here rather than on their own screen.
 */
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

  // Showing where a document usually hides only helps before one is chosen.
  const showFileLocations = stage === "file";

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
  // A screen that says nobody knows whether the page printed must not wear a
  // tick. Each tone gets the mark that matches what it is claiming.
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

/**
 * Names only the Hancom formats this kiosk actually declared. Saying
 * "HWP/HWPX" to a printer that can open just one of them sends the visitor
 * away to convert a file it would have accepted, or promises one it cannot.
 */
function hancomFormatLabel(supportsHwp: boolean, supportsHwpx: boolean): string {
  // Narrow the name only when the kiosk genuinely supports one format and not
  // the other. When it supports both — or neither, where the only message is a
  // refusal covering both — naming both is what is accurate.
  if (supportsHwp === supportsHwpx) return "HWP/HWPX";
  return supportsHwp ? "HWP" : "HWPX";
}

function applyHancomLabel(value: string, label: string): string {
  return value.replaceAll("HWPX", label);
}

/** The picker only offers what the kiosk can print. */
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
