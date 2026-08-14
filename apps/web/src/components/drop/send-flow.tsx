"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  CheckCircle2,
  Copy,
  Download,
  FilePlus2,
  Files,
  Image as ImageIcon,
  LockKeyhole,
  Send,
  Share2,
  Timer,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import QRCode from "qrcode";

import { formatDropCode } from "@print-cess/protocol";
import { PrimaryButton, ProgressSteps, SecondaryButton, StatusIcon } from "@print-cess/ui";

import { getDropStatus, revokeDrop } from "@/lib/drop-client";
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
  sendDrop,
  type DropProgress,
  type PreparedSelection,
  type SendResult,
} from "@/lib/drop-transfer";

import {
  DropShell,
  TransferBar,
  formatBytes,
  minutesUntil,
  useDropLocale,
  type Text,
} from "./drop-shell";
import { dropErrorKey } from "./drop-errors";

type Stage = "pick" | "sending" | "ready" | "error";

const PICKUP_POLL_MS = 5000;

export function SendFlow() {
  const [locale, setLocale, text] = useDropLocale();
  const [stage, setStage] = useState<Stage>("pick");
  const [selection, setSelection] = useState<PreparedSelection>();
  const [progress, setProgress] = useState<DropProgress>();
  const [result, setResult] = useState<SendResult>();
  const [qrImage, setQrImage] = useState("");
  const [pickedUp, setPickedUp] = useState(false);
  const [copied, setCopied] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const [errorKey, setErrorKey] = useState("dropNetworkError");
  const [selectionErrorKey, setSelectionErrorKey] = useState<string>();
  const [minutesRemaining, setMinutesRemaining] = useState<number | null>(null);
  const samples = useRef<ThroughputSample[]>([]);
  const canShare = useSyncExternalStore(subscribeNever, supportsSharing, () => false);
  const photoInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const abort = useRef<AbortController>(null);

  const addFiles = useCallback((incoming: FileList | null) => {
    if (!incoming || incoming.length === 0) return;
    setSelectionErrorKey(undefined);
    setSelection((current) => {
      const merged = [...(current?.files ?? []), ...Array.from(incoming)];
      // The same file picked twice would be sent twice; identity here is the
      // name, size, and modification time the browser reports.
      const unique = merged.filter(
        (file, index) =>
          merged.findIndex(
            (candidate) =>
              candidate.name === file.name &&
              candidate.size === file.size &&
              candidate.lastModified === file.lastModified,
          ) === index,
      );
      try {
        return prepareSelection(unique);
      } catch (error) {
        setSelectionErrorKey(dropErrorKey(error));
        return current;
      }
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelection(undefined);
    setSelectionErrorKey(undefined);
    if (photoInput.current) photoInput.current.value = "";
    if (fileInput.current) fileInput.current.value = "";
  }, []);

  const start = useCallback(async () => {
    if (!selection) return;
    const controller = new AbortController();
    abort.current = controller;
    setStage("sending");
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
      const sent = await sendDrop(selection, {
        signal: controller.signal,
        onProgress: (next) => {
          setProgress(next);
          samples.current = recordSample(samples.current, next, Date.now());
          setMinutesRemaining(estimateMinutesRemaining(samples.current, next));
        },
      });
      const link = buildDropLink(window.location.origin, sent.code);
      const image = await QRCode.toDataURL(link, {
        errorCorrectionLevel: "M",
        margin: 2,
        scale: 9,
        color: { dark: "#071737", light: "#ffffff" },
      });
      setResult(sent);
      setQrImage(image);
      setStage("ready");
    } catch (error) {
      setErrorKey(dropErrorKey(error));
      setStage("error");
    } finally {
      releaseWakeLock();
      abort.current = null;
    }
  }, [selection]);

  const stop = useCallback(() => {
    abort.current?.abort();
  }, []);

  // Once the transfer is waiting, the only thing left to tell the sender is
  // whether it has been collected yet.
  useEffect(() => {
    if (stage !== "ready" || !result || pickedUp || deleted) return;
    let active = true;
    const timer = window.setInterval(() => {
      void getDropStatus(result.dropId, result.ownerToken)
        .then((status) => {
          if (active && status.downloadCount > 0) setPickedUp(true);
        })
        .catch(() => undefined);
    }, PICKUP_POLL_MS);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [deleted, pickedUp, result, stage]);

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
    await revokeDrop(result.dropId, result.ownerToken).catch(() => undefined);
    setDeleted(true);
  }, [result]);

  const restart = useCallback(() => {
    setSelection(undefined);
    setResult(undefined);
    setQrImage("");
    setProgress(undefined);
    setPickedUp(false);
    setDeleted(false);
    setStage("pick");
  }, []);

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
          <div className="mobile-source-actions">
            <SecondaryButton onClick={() => photoInput.current?.click()}>
              <ImageIcon aria-hidden="true" /> {text("locationPhotos")}
            </SecondaryButton>
            <SecondaryButton onClick={() => fileInput.current?.click()}>
              <Files aria-hidden="true" /> {text("locationFiles")}
            </SecondaryButton>
          </div>
          {selection ? (
            <SelectedFiles selection={selection} text={text} onClear={clearSelection} />
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
            <h1>{text("dropReady")}</h1>
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
            <div className="drop-status" role="status">
              {pickedUp ? (
                <>
                  <Download aria-hidden="true" /> {text("dropPickedUp")}
                </>
              ) : (
                <>
                  <Timer aria-hidden="true" />{" "}
                  {text("dropExpiresIn", { minutes: minutesUntil(result.expiresAt) })} ·{" "}
                  {text("dropWaitingPickup")}
                </>
              )}
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

function SelectedFiles({
  selection,
  text,
  onClear,
}: {
  selection: PreparedSelection;
  text: Text;
  onClear: () => void;
}) {
  return (
    <div className="drop-selection">
      <p className="drop-selection__summary">
        {text("dropSelectedSummary", {
          count: selection.files.length,
          size: formatBytes(selection.totalBytes),
        })}
      </p>
      <ul className="drop-file-list">
        {selection.manifestFiles.map((file, index) => (
          <li key={`${file.name}-${index}`}>
            <span className="drop-file-list__name">{file.name}</span>
            <span className="drop-file-list__size">{formatBytes(file.size)}</span>
          </li>
        ))}
      </ul>
      <SecondaryButton onClick={onClear}>{text("dropClearSelection")}</SecondaryButton>
    </div>
  );
}

function subscribeNever(): () => void {
  // Sharing support does not change while a transfer screen is open.
  return () => {};
}
