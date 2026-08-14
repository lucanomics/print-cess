"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { CheckCircle2, Download, Send, Timer, TriangleAlert } from "lucide-react";

import {
  DROP_CODE_LENGTH,
  DROP_CODE_PATTERN,
  formatDropCode,
  normalizeDropCode,
} from "@print-cess/protocol";
import { PrimaryButton, SecondaryButton, StatusIcon } from "@print-cess/ui";

import { parseDropFragment } from "@/lib/drop-link";
import {
  inspectDrop,
  receiveDropFile,
  type DropProgress,
  type ReceivedDrop,
} from "@/lib/drop-transfer";
import { supportsStreamingSave } from "@/lib/drop-writer";

import {
  DropShell,
  TransferBar,
  formatBytes,
  minutesUntil,
  useDropLocale,
  type Text,
} from "./drop-shell";
import { dropErrorKey } from "./drop-errors";

type Stage = "code" | "checking" | "files" | "saving" | "saved" | "error";

/** Below this, buffering a file in memory is not worth a warning. */
const MEMORY_WARNING_BYTES = 256 * 1024 * 1024;

export function ReceiveFlow() {
  const [locale, setLocale, text] = useDropLocale();
  // Read during render, not in an effect, so a phone arriving from a scanned QR
  // code never flashes the keypad before the transfer opens.
  const scannedOnArrival = useSyncExternalStore(subscribeNever, readHasFragment, () => false);
  const [stage, setStage] = useState<Stage>("code");
  const [code, setCode] = useState("");
  const [drop, setDrop] = useState<ReceivedDrop>();
  const [progress, setProgress] = useState<DropProgress>();
  const [savingIndex, setSavingIndex] = useState(0);
  const [errorKey, setErrorKey] = useState("dropNetworkError");
  const abort = useRef<AbortController>(null);

  const open = useCallback(async (candidate: string) => {
    setStage("checking");
    try {
      const opened = await inspectDrop(candidate);
      setDrop(opened);
      setStage("files");
    } catch (error) {
      setErrorKey(dropErrorKey(error));
      setStage("error");
    }
  }, []);

  // A scanned QR code carries the transfer code in the fragment, so the
  // receiving phone skips straight past the keypad. The fragment is dropped
  // once the transfer is open, which also lets a reload before then retry with
  // the same code instead of stranding the visitor on an empty keypad.
  useEffect(() => {
    const scanned = parseDropFragment(window.location.hash);
    if (!scanned) return;
    let active = true;
    const settle = (apply: () => void) => {
      if (!active) return;
      history.replaceState(null, "", window.location.pathname);
      apply();
    };
    void inspectDrop(scanned).then(
      (opened) =>
        settle(() => {
          setDrop(opened);
          setStage("files");
        }),
      (error: unknown) =>
        settle(() => {
          setErrorKey(dropErrorKey(error));
          setStage("error");
        }),
    );
    return () => {
      active = false;
    };
  }, []);

  const saveAll = useCallback(async () => {
    if (!drop) return;
    const controller = new AbortController();
    abort.current = controller;
    const firstFile = drop.manifest.files[0];
    setSavingIndex(0);
    setProgress(
      firstFile
        ? {
            transferredBytes: 0,
            totalBytes: firstFile.size,
            completedParts: 0,
            totalParts: firstFile.chunkCount,
          }
        : undefined,
    );
    setStage("saving");
    try {
      for (let index = 0; index < drop.manifest.files.length; index += 1) {
        const file = drop.manifest.files[index];
        if (!file) continue;
        setSavingIndex(index);
        setProgress({
          transferredBytes: 0,
          totalBytes: file.size,
          completedParts: 0,
          totalParts: file.chunkCount,
        });
        await receiveDropFile(drop, index, {
          signal: controller.signal,
          onProgress: setProgress,
        });
      }
      setStage("saved");
    } catch (error) {
      setErrorKey(dropErrorKey(error));
      setStage("error");
    } finally {
      abort.current = null;
    }
  }, [drop]);

  const restart = useCallback(() => {
    setDrop(undefined);
    setCode("");
    setProgress(undefined);
    setStage("code");
  }, []);

  const normalized = normalizeDropCode(code);
  const codeComplete = DROP_CODE_PATTERN.test(normalized);
  const checking = stage === "checking" || (stage === "code" && scannedOnArrival);
  const totalBytes = drop?.totalBytes ?? 0;
  const showMemoryNotice =
    stage === "files" && totalBytes > MEMORY_WARNING_BYTES && !supportsStreamingSave();

  return (
    <DropShell locale={locale} onLocaleChange={setLocale} text={text}>
      {stage === "code" && !checking ? (
        <section className="mobile-step">
          <h1>{text("dropEnterCode")}</h1>
          <p>{text("dropEnterCodeHint")}</p>
          <label className="drop-code-field">
            <span className="drop-visually-hidden">{text("dropCodeLabel")}</span>
            <input
              autoFocus
              data-testid="drop-code-input"
              inputMode="text"
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              maxLength={DROP_CODE_LENGTH + 4}
              placeholder="ABCD-EFGH-JKMN"
              value={formatDropCode(normalized)}
              onChange={(event) =>
                setCode(normalizeDropCode(event.target.value).slice(0, DROP_CODE_LENGTH))
              }
            />
          </label>
          <PrimaryButton disabled={!codeComplete} onClick={() => void open(normalized)}>
            <Download aria-hidden="true" /> {text("dropOpenTransfer")}
          </PrimaryButton>
          <a className="drop-link" href="/send">
            <Send aria-hidden="true" /> {text("dropSendCta")}
          </a>
        </section>
      ) : null}

      {checking ? (
        <section className="mobile-step mobile-step--single" aria-busy="true">
          <div className="mobile-spinner" />
          <p>{text("dropChecking")}</p>
        </section>
      ) : null}

      {stage === "files" && drop ? (
        <section className="mobile-step">
          <h1>{text("dropFilesTitle")}</h1>
          <p>{text("dropFilesHint")}</p>
          <ul className="drop-file-list">
            {drop.manifest.files.map((file, index) => (
              <li key={`${file.name}-${index}`}>
                <span className="drop-file-list__name">{file.name}</span>
                <span className="drop-file-list__size">{formatBytes(file.size)}</span>
              </li>
            ))}
          </ul>
          <p className="drop-status">
            <Timer aria-hidden="true" />{" "}
            {text("dropExpiresIn", { minutes: minutesUntil(drop.expiresAt) })} ·{" "}
            {formatBytes(totalBytes)}
          </p>
          {showMemoryNotice ? (
            <p className="drop-notice" role="status">
              {text("dropMemoryNotice")}
            </p>
          ) : null}
          <PrimaryButton onClick={() => void saveAll()}>
            <Download aria-hidden="true" /> {text("dropSaveAll")}
          </PrimaryButton>
        </section>
      ) : null}

      {stage === "saving" && progress && drop ? (
        <section className="mobile-step mobile-step--single" aria-live="polite">
          <h1>{text("dropSaving")}</h1>
          <p>{drop.manifest.files[savingIndex]?.name}</p>
          <TransferBar progress={progress} text={text} />
          <SecondaryButton onClick={() => abort.current?.abort()}>
            {text("dropCancel")}
          </SecondaryButton>
        </section>
      ) : null}

      {stage === "saved" ? (
        <section className="mobile-step mobile-step--single">
          <StatusIcon tone="success">
            <CheckCircle2 size={34} aria-hidden="true" />
          </StatusIcon>
          <h1>{text("dropSaved")}</h1>
          <p>{text("dropSavedHint")}</p>
          <SecondaryButton onClick={restart}>{text("dropReceiveAnother")}</SecondaryButton>
          <a className="drop-link" href="/send">
            <Send aria-hidden="true" /> {text("dropSendCta")}
          </a>
        </section>
      ) : null}

      {stage === "error" ? <ErrorState errorKey={errorKey} text={text} onRetry={restart} /> : null}
    </DropShell>
  );
}

function subscribeNever(): () => void {
  // The fragment is set before the page loads and cleared exactly once.
  return () => {};
}

function readHasFragment(): boolean {
  return parseDropFragment(window.location.hash) !== null;
}

function ErrorState({
  errorKey,
  text,
  onRetry,
}: {
  errorKey: string;
  text: Text;
  onRetry: () => void;
}) {
  return (
    <section className="mobile-step mobile-step--single">
      <StatusIcon tone="error">
        <TriangleAlert size={34} aria-hidden="true" />
      </StatusIcon>
      <h1>{text(errorKey)}</h1>
      <PrimaryButton onClick={onRetry}>{text("dropEnterCode")}</PrimaryButton>
    </section>
  );
}
