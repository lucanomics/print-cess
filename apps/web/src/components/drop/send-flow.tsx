"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  CheckCircle2,
  Copy,
  Files,
  FilePlus2,
  Image as ImageIcon,
  LockKeyhole,
  Send,
  Share2,
  Timer,
  Trash2,
  TriangleAlert,
  Upload,
  X,
} from "lucide-react";
import QRCode from "qrcode";

import type { SupportedLocale } from "@print-cess/i18n";
import { formatDropCode, type DropReceiverState } from "@print-cess/protocol";
import { PrimaryButton, ProgressSteps, SecondaryButton, StatusIcon } from "@print-cess/ui";

import { getDropCapabilities, getDropStatus, revokeDrop } from "@/lib/drop-client";
import { buildDropLink } from "@/lib/drop-link";
import {
  estimateMinutesRemaining,
  holdScreenAwake,
  recordSample,
  shareTransferLink,
  supportsSharing,
  type ThroughputSample,
} from "@/lib/drop-progress";
import {
  prepareSelection,
  PROTOCOL_DROP_LIMITS,
  sendDrop,
  type DropLimits,
  type DropProgress,
  type PreparedSelection,
  type SendResult,
} from "@/lib/drop-transfer";

import {
  DropShell,
  FileRow,
  TransferBar,
  formatBytes,
  minutesUntil,
  useDropLocale,
  type Text,
} from "./drop-shell";
import { dropErrorKey } from "./drop-errors";

type Stage = "pick" | "sending" | "ready" | "error";

const PICKUP_POLL_MS = 5000;

export function SendFlow({ initialLocale }: { initialLocale?: SupportedLocale }) {
  const [locale, setLocale, text] = useDropLocale(initialLocale);
  const [stage, setStage] = useState<Stage>("pick");
  const [chosen, setChosen] = useState<File[]>([]);
  const [limits, setLimits] = useState<DropLimits>(PROTOCOL_DROP_LIMITS);
  const [progress, setProgress] = useState<DropProgress>();
  const [result, setResult] = useState<SendResult>();
  const [qrImage, setQrImage] = useState("");
  const [receiver, setReceiver] = useState<DropReceiverState>("waiting");
  const [sealed, setSealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const [errorKey, setErrorKey] = useState("dropNetworkError");
  const [minutesRemaining, setMinutesRemaining] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const samples = useRef<ThroughputSample[]>([]);
  const canShare = useSyncExternalStore(subscribeNever, supportsSharing, () => false);
  const photoInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const abort = useRef<AbortController>(null);

  // The published limits, so a selection that this deployment will never accept
  // is refused on the phone rather than after several minutes of uploading.
  useEffect(() => {
    const controller = new AbortController();
    void getDropCapabilities(controller.signal)
      .then((capabilities) =>
        setLimits({
          maximumTotalBytes: capabilities.maximumTotalBytes,
          maximumFileCount: capabilities.maximumFileCount,
          maximumParts: capabilities.maximumParts,
        }),
      )
      .catch(() => {
        // The protocol ceilings remain in force; the server checks again anyway.
      });
    return () => controller.abort();
  }, []);

  // The selection is a pure function of the chosen files and the published
  // limits, so it is derived rather than stored. Removing one file therefore
  // costs one removal, instead of clearing everything and starting again.
  const { selection, selectionErrorKey } = useMemo(() => {
    if (chosen.length === 0) return { selection: undefined, selectionErrorKey: undefined };
    try {
      return { selection: prepareSelection(chosen, limits), selectionErrorKey: undefined };
    } catch (error) {
      return { selection: undefined, selectionErrorKey: dropErrorKey(error) };
    }
  }, [chosen, limits]);

  const addFiles = useCallback((incoming: FileList | readonly File[] | null) => {
    if (!incoming) return;
    const arriving = Array.from(incoming);
    if (arriving.length === 0) return;
    setChosen((current) => {
      const merged = [...current, ...arriving];
      // The same file picked twice would be sent twice; identity here is the
      // name, size, and modification time the browser reports.
      return merged.filter(
        (file, index) =>
          merged.findIndex(
            (candidate) =>
              candidate.name === file.name &&
              candidate.size === file.size &&
              candidate.lastModified === file.lastModified,
          ) === index,
      );
    });
  }, []);

  const removeFile = useCallback((index: number) => {
    setChosen((current) => current.filter((_, at) => at !== index));
  }, []);

  const clearSelection = useCallback(() => {
    setChosen([]);
    if (photoInput.current) photoInput.current.value = "";
    if (fileInput.current) fileInput.current.value = "";
  }, []);

  const showCode = useCallback(async (sent: SendResult) => {
    setResult(sent);
    const link = buildDropLink(window.location.origin, sent.code);
    const image = await QRCode.toDataURL(link, {
      errorCorrectionLevel: "M",
      margin: 2,
      scale: 9,
      color: { dark: "#071737", light: "#ffffff" },
    });
    setQrImage(image);
    setStage("ready");
  }, []);

  const start = useCallback(async () => {
    if (!selection) return;
    const controller = new AbortController();
    abort.current = controller;
    setStage("sending");
    setSealed(false);
    setReceiver("waiting");
    samples.current = [];
    setMinutesRemaining(null);
    setProgress({
      transferredBytes: 0,
      totalBytes: selection.totalBytes,
      completedParts: 0,
      totalParts: selection.partCount,
    });
    // A phone that sleeps mid-upload throttles timers and can stall the
    // transfer, which reads as the service quietly failing.
    const releaseWakeLock = await holdScreenAwake();
    try {
      await sendDrop(selection, {
        signal: controller.signal,
        // The code appears as soon as the service holds the record, not when
        // the last byte lands. The other phone can scan and wait through a
        // gigabyte instead of watching this one's progress bar first.
        onDropCreated: (created) => void showCode(created),
        onProgress: (next) => {
          setProgress(next);
          samples.current = recordSample(samples.current, next, Date.now());
          setMinutesRemaining(estimateMinutesRemaining(samples.current, next));
        },
      });
      setSealed(true);
    } catch (error) {
      setErrorKey(dropErrorKey(error));
      setStage("error");
    } finally {
      releaseWakeLock();
      abort.current = null;
    }
  }, [selection, showCode]);

  const stop = useCallback(() => {
    abort.current?.abort();
  }, []);

  // Once the code is on screen, the only thing left to tell the sender is how
  // far the other phone has got — in the four steps the service can honestly
  // distinguish, and no further.
  useEffect(() => {
    if (stage !== "ready" || !result || deleted || receiver === "delivered") return;
    let active = true;
    const timer = window.setInterval(() => {
      void getDropStatus(result.dropId, result.ownerToken)
        .then((status) => {
          if (active) setReceiver(status.receiver);
        })
        .catch(() => undefined);
    }, PICKUP_POLL_MS);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [deleted, receiver, result, stage]);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 2500);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const copyLink = useCallback(async () => {
    if (!result) return;
    const link = buildDropLink(window.location.origin, result.code);
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      // Clipboard access can be refused; the code on screen still works.
    }
  }, [result]);

  const share = useCallback(async () => {
    if (!result) return;
    const link = buildDropLink(window.location.origin, result.code);
    if (!(await shareTransferLink(link, text("dropTitle")))) await copyLink();
  }, [copyLink, result, text]);

  const erase = useCallback(async () => {
    if (!result) return;
    abort.current?.abort();
    await revokeDrop(result.dropId, result.ownerToken).catch(() => undefined);
    setDeleted(true);
  }, [result]);

  const restart = useCallback(() => {
    clearSelection();
    setResult(undefined);
    setQrImage("");
    setProgress(undefined);
    setReceiver("waiting");
    setSealed(false);
    setDeleted(false);
    setStage("pick");
  }, [clearSelection]);

  const step = stage === "pick" ? 1 : stage === "sending" ? 2 : 3;

  return (
    <DropShell locale={locale} onLocaleChange={setLocale} text={text}>
      {stage === "error" ? null : (
        <ProgressSteps current={step} total={3} label={text("step", { current: step, total: 3 })} />
      )}

      {stage === "pick" ? (
        <section className="mobile-step">
          <h1>{text("dropPickFiles")}</h1>
          <p>{text("dropPickHint")}</p>
          <input
            ref={photoInput}
            data-testid="drop-photo-input"
            hidden
            multiple
            type="file"
            accept="image/*,video/*"
            onChange={(event) => addFiles(event.target.files)}
          />
          <input
            ref={fileInput}
            data-testid="drop-file-input"
            hidden
            multiple
            type="file"
            onChange={(event) => addFiles(event.target.files)}
          />
          {selectionErrorKey ? (
            <p className="mobile-file-error" role="alert">
              {text(selectionErrorKey)}
            </p>
          ) : null}
          {/* A pointer environment can drop files straight onto the page. The
              buttons stay exactly where they were, because a phone has no
              drag and this must never become the only way in. */}
          <div
            className={dragging ? "drop-target is-dragging" : "drop-target"}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              addFiles(event.dataTransfer?.files ?? null);
            }}
          >
            <p className="drop-target__hint">
              <Upload aria-hidden="true" /> {text("dropDragHere")}
            </p>
            <div className="mobile-source-actions">
              <SecondaryButton onClick={() => photoInput.current?.click()}>
                <ImageIcon aria-hidden="true" /> {text("locationPhotos")}
              </SecondaryButton>
              <SecondaryButton onClick={() => fileInput.current?.click()}>
                <Files aria-hidden="true" /> {text("locationFiles")}
              </SecondaryButton>
            </div>
          </div>
          {chosen.length > 0 ? (
            <SelectedFiles
              files={chosen}
              selection={selection}
              text={text}
              onRemove={removeFile}
              onClear={clearSelection}
              onAddMore={() => fileInput.current?.click()}
            />
          ) : null}
          <p className="drop-privacy">
            <LockKeyhole aria-hidden="true" /> {text("dropPrivacyNote")}
          </p>
          {selection ? (
            <PrimaryButton onClick={() => void start()}>
              <Send aria-hidden="true" /> {text("dropStartSending")}
            </PrimaryButton>
          ) : null}
        </section>
      ) : null}

      {stage === "sending" && progress ? (
        <section className="mobile-step mobile-step--single" aria-live="polite">
          <h1>{text("dropSending")}</h1>
          <TransferBar progress={progress} text={text} minutesRemaining={minutesRemaining} />
          <p>{text("dropSendingHint")}</p>
          <SecondaryButton onClick={stop}>{text("dropCancel")}</SecondaryButton>
        </section>
      ) : null}

      {stage === "ready" && result ? (
        deleted ? (
          <section className="mobile-step mobile-step--single">
            <StatusIcon tone="success">
              <Trash2 size={34} aria-hidden="true" />
            </StatusIcon>
            <h1>{text("dropDeleted")}</h1>
            <PrimaryButton onClick={restart}>
              <FilePlus2 aria-hidden="true" /> {text("dropSendAnother")}
            </PrimaryButton>
          </section>
        ) : (
          <section className="mobile-step drop-ready">
            <h1>{text(sealed ? "dropReady" : "dropReadyEarly")}</h1>
            <p>{text("dropReadyHint")}</p>
            {qrImage ? (
              <figure className="drop-qr">
                {/* eslint-disable-next-line @next/next/no-img-element -- a data URL generated in the browser */}
                <img src={qrImage} alt={text("dropScanToReceive")} />
                <figcaption>{text("dropScanToReceive")}</figcaption>
              </figure>
            ) : null}
            <div className="drop-code">
              <span className="drop-code__label">{text("dropCodeLabel")}</span>
              <strong>{formatDropCode(result.code)}</strong>
            </div>
            {!sealed && progress ? (
              <div className="drop-still-sending">
                <TransferBar progress={progress} text={text} minutesRemaining={minutesRemaining} />
                <p>{text("dropStillSending")}</p>
              </div>
            ) : null}
            <div className="drop-status" role="status">
              <ReceiverStatus
                receiver={receiver}
                sealed={sealed}
                expiresAt={result.expiresAt}
                text={text}
              />
            </div>
            {canShare ? (
              <SecondaryButton onClick={() => void share()}>
                <Share2 aria-hidden="true" /> {text("dropShareLink")}
              </SecondaryButton>
            ) : null}
            <SecondaryButton onClick={() => void copyLink()}>
              {copied ? <CheckCircle2 aria-hidden="true" /> : <Copy aria-hidden="true" />}{" "}
              {copied ? text("dropCopied") : text("dropCopyLink")}
            </SecondaryButton>
            <SecondaryButton onClick={() => void erase()}>
              <Trash2 aria-hidden="true" /> {text("dropDeleteNow")}
            </SecondaryButton>
            <a className="drop-link" href="/receive">
              {text("dropReceiveCta")}
            </a>
          </section>
        )
      ) : null}

      {stage === "error" ? (
        <section className="mobile-step mobile-step--single">
          <StatusIcon tone="error">
            <TriangleAlert size={34} aria-hidden="true" />
          </StatusIcon>
          <h1>{text(errorKey)}</h1>
          <PrimaryButton onClick={restart}>{text("dropClearSelection")}</PrimaryButton>
        </section>
      ) : null}
    </DropShell>
  );
}

/**
 * What the service actually knows about the other phone, and nothing more.
 * "Opened" is an open request; "on their way" is a first chunk being asked for;
 * "taken" is the receiving flow reporting that it finished. Saying any of these
 * one step early is the difference between a receipt and a guess.
 */
function ReceiverStatus({
  receiver,
  sealed,
  expiresAt,
  text,
}: {
  receiver: DropReceiverState;
  sealed: boolean;
  expiresAt: number;
  text: Text;
}) {
  if (receiver === "delivered") {
    return (
      <>
        <CheckCircle2 aria-hidden="true" /> {text("dropReceiverDelivered")}
      </>
    );
  }
  if (receiver === "downloading") {
    return (
      <>
        <Send aria-hidden="true" /> {text("dropReceiverDownloading")}
      </>
    );
  }
  if (receiver === "opened") {
    return (
      <>
        <CheckCircle2 aria-hidden="true" />{" "}
        {text(sealed ? "dropReceiverOpened" : "dropReceiverWaitingOnUpload")}
      </>
    );
  }
  return (
    <>
      <Timer aria-hidden="true" /> {text("dropExpiresIn", { minutes: minutesUntil(expiresAt) })} ·{" "}
      {text("dropWaitingPickup")}
    </>
  );
}

function SelectedFiles({
  files,
  selection,
  text,
  onRemove,
  onClear,
  onAddMore,
}: {
  files: readonly File[];
  selection: PreparedSelection | undefined;
  text: Text;
  onRemove: (index: number) => void;
  onClear: () => void;
  onAddMore: () => void;
}) {
  const totalBytes = files.reduce((total, file) => total + file.size, 0);
  return (
    <div className="drop-selection">
      <p className="drop-selection__summary">
        {text("dropSelectedSummary", {
          count: files.length,
          size: formatBytes(totalBytes),
        })}
      </p>
      <ul className="drop-file-list drop-file-list--removable">
        {files.map((file, index) => (
          <li key={`${file.name}-${file.size}-${file.lastModified}`} className="drop-file">
            <FileRow
              file={{
                // The name shown is the one that will travel, so a name the
                // policy had to change is visible before anything is sent.
                name: selection?.manifestFiles[index]?.name ?? file.name,
                size: file.size,
                type: file.type,
              }}
              text={text}
            />
            <button
              type="button"
              className="drop-file__remove"
              onClick={() => onRemove(index)}
              aria-label={text("dropRemoveFile", { name: file.name })}
            >
              <X aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
      <div className="drop-selection__actions">
        <SecondaryButton onClick={onAddMore}>
          <FilePlus2 aria-hidden="true" /> {text("dropAddMore")}
        </SecondaryButton>
        <SecondaryButton onClick={onClear}>{text("dropClearSelection")}</SecondaryButton>
      </div>
    </div>
  );
}

function subscribeNever(): () => void {
  // Sharing support does not change while a transfer screen is open.
  return () => {};
}
