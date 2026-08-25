"use client";

import { Delete } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { PAIRING_CODE_LENGTH } from "@print-cess/protocol";

import { ApiClientError } from "@/lib/api-client";
import { awaitTransferCode, joinPairing, type ReceiverPairing } from "@/lib/drop-pairing";
import type { Text } from "@/lib/use-visitor-locale";

import { PairingShapeMark, shapeLabel } from "./pairing-shape";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

/**
 * The receiving phone's half of the short-code hand-off: two digits in, one
 * shape out. The shape is what the sending human has to find on this screen and
 * pick on theirs, and until they do, this phone holds no transfer code and can
 * reach no files.
 */
export function PairingEntry({
  text,
  onTransferCode,
  onError,
}: {
  text: Text;
  onTransferCode: (code: string) => void;
  onError: (errorKey: string) => void;
}) {
  const [digits, setDigits] = useState("");
  const [pairing, setPairing] = useState<ReceiverPairing>();
  const [joining, setJoining] = useState(false);
  const [noticeKey, setNoticeKey] = useState<string>();
  const abort = useRef<AbortController>(null);

  useEffect(() => () => abort.current?.abort(), []);

  const join = useCallback(async (code: string) => {
    setJoining(true);
    setNoticeKey(undefined);
    try {
      const joined = await joinPairing(code);
      setPairing(joined);
    } catch (error) {
      setDigits("");
      // A guessed pair of digits and a pair belonging to a transfer someone
      // else is already receiving are the only two things this can be, and
      // they are the two the person can act on.
      setNoticeKey(
        error instanceof ApiClientError && error.status === 409
          ? "pairCodeBusy"
          : "pairCodeUnknown",
      );
    } finally {
      setJoining(false);
    }
  }, []);

  // Waiting for the sending human to pick the shape. The transfer code arrives
  // sealed, is opened here, and never touches the service in the clear.
  useEffect(() => {
    if (!pairing) return;
    const controller = new AbortController();
    abort.current = controller;
    void (async () => {
      try {
        onTransferCode(await awaitTransferCode(pairing, controller.signal));
      } catch (error) {
        if (controller.signal.aborted) return;
        onError(
          error instanceof ApiClientError && error.status === 404
            ? "dropExpired"
            : "dropNetworkError",
        );
      }
    })();
    return () => controller.abort();
  }, [onError, onTransferCode, pairing]);

  const press = useCallback(
    (digit: string) => {
      setNoticeKey(undefined);
      setDigits((current) => {
        if (current.length >= PAIRING_CODE_LENGTH) return current;
        const next = current + digit;
        if (next.length === PAIRING_CODE_LENGTH) void join(next);
        return next;
      });
    },
    [join],
  );

  if (pairing) {
    return (
      <section className="mobile-step" aria-live="polite">
        <h1>{text("pairShowShape")}</h1>
        <p>{text("pairShowShapeHint")}</p>
        <figure className="pairing-shown">
          <div className="pairing-shown__figure">
            <PairingShapeMark shape={pairing.secret.shape} />
          </div>
          <figcaption>{shapeLabel(pairing.secret.shape, text)}</figcaption>
        </figure>
        <p className="drop-notice" role="status">
          {text("pairAwaitingConfirm")}
        </p>
      </section>
    );
  }

  return (
    <section className="mobile-step">
      <h1>{text("pairEnterShortCode")}</h1>
      <p>{text("pairEnterShortCodeHint")}</p>
      <p
        className={digits ? "pairing-entry" : "pairing-entry pairing-entry--empty"}
        data-testid="pairing-entry"
        aria-label={text("pairEnterShortCode")}
        role="status"
      >
        {digits.padEnd(PAIRING_CODE_LENGTH, "–")}
      </p>
      {noticeKey ? (
        <p className="drop-notice" role="alert">
          {text(noticeKey)}
        </p>
      ) : null}
      <div className="pairing-keypad">
        {KEYS.map((digit) => (
          <button
            key={digit}
            type="button"
            disabled={joining}
            onClick={() => press(digit)}
            data-testid={`pairing-key-${digit}`}
          >
            {digit}
          </button>
        ))}
        <span />
        <button
          type="button"
          disabled={joining}
          onClick={() => press("0")}
          data-testid="pairing-key-0"
        >
          0
        </button>
        <button
          type="button"
          disabled={joining || digits.length === 0}
          onClick={() => setDigits((current) => current.slice(0, -1))}
          aria-label={text("dropBack")}
          data-testid="pairing-key-back"
        >
          <Delete aria-hidden="true" />
        </button>
      </div>
    </section>
  );
}
