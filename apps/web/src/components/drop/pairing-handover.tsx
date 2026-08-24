"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { PairingSecret } from "@print-cess/crypto";
import type { PairingShape } from "@print-cess/protocol";

import {
  abandonPairing,
  awaitReceiver,
  deliverTransferCode,
  openPairing,
  shapeChoices,
  type SenderPairing,
} from "@/lib/drop-pairing";
import type { Text } from "@/lib/use-visitor-locale";

import { PairingShapeMark, shapeLabel } from "./pairing-shape";

/**
 * The sending phone's half of the short-code hand-off.
 *
 * The two digits are only a way for the other phone to find this one. What
 * actually releases the transfer code is the step after: the other phone shows
 * a shape derived from both ephemeral keys, and the person holding this phone
 * picks the same shape out of four. Somebody who merely guessed the digits is
 * not standing here to be picked, and a relay that swapped a key changes the
 * shape on one screen and not the other.
 */
export function PairingHandover({ transferCode, text }: { transferCode: string; text: Text }) {
  const [pairing, setPairing] = useState<SenderPairing>();
  const [secret, setSecret] = useState<PairingSecret>();
  const [handedOver, setHandedOver] = useState(false);
  const [wrongPick, setWrongPick] = useState(false);
  const [sending, setSending] = useState(false);
  const attempt = useRef<Promise<SenderPairing>>(null);

  // Claiming a code mints server-side state and takes one of a hundred slots,
  // so it happens once per screen rather than once per run of this effect.
  useEffect(() => {
    let active = true;
    attempt.current ??= openPairing();
    void attempt.current.then(
      (claimed) => {
        if (active) setPairing(claimed);
      },
      () => undefined,
    );
    return () => {
      active = false;
    };
  }, []);

  // Two digits are worth holding for as long as somebody might type them and no
  // longer, so leaving the page hands them straight back.
  useEffect(() => {
    if (!pairing) return;
    return () => void abandonPairing(pairing);
  }, [pairing]);

  useEffect(() => {
    if (!pairing || secret) return;
    const controller = new AbortController();
    void awaitReceiver(pairing, controller.signal).then(
      (agreed) => {
        if (!controller.signal.aborted) setSecret(agreed);
      },
      () => undefined,
    );
    return () => controller.abort();
  }, [pairing, secret]);

  const pick = useCallback(
    async (choice: PairingShape) => {
      if (!pairing || !secret || sending) return;
      // Compared against what this phone derived, never against anything the
      // service said. A wrong pick means the shape on the other screen came
      // out of a different exchange, so the code stays here.
      if (choice !== secret.shape) {
        setWrongPick(true);
        return;
      }
      setSending(true);
      try {
        await deliverTransferCode(pairing, secret, transferCode);
        setHandedOver(true);
      } catch {
        setWrongPick(true);
      } finally {
        setSending(false);
      }
    },
    [pairing, secret, sending, transferCode],
  );

  if (handedOver) {
    return (
      <p className="drop-notice" role="status">
        {text("pairHandedOver")}
      </p>
    );
  }

  if (secret) {
    return (
      <section className="pairing-pick" aria-live="polite">
        <h2>{text("pairPickShape")}</h2>
        <p>{text("pairPickShapeHint")}</p>
        {wrongPick ? (
          <p className="drop-notice" role="alert">
            {text("pairWrongShape")}
          </p>
        ) : null}
        <div className="pairing-choices">
          {shapeChoices().map((choice) => (
            <button
              key={choice}
              type="button"
              disabled={sending}
              onClick={() => void pick(choice)}
              data-testid={`pairing-choice-${choice}`}
            >
              <PairingShapeMark shape={choice} />
              <span>{shapeLabel(choice, text)}</span>
            </button>
          ))}
        </div>
      </section>
    );
  }

  return (
    <div className="pairing-digits">
      <span className="pairing-digits__label">{text("pairShortCode")}</span>
      <strong data-testid="pairing-code">{pairing?.code ?? "··"}</strong>
      <small>{pairing ? text("pairShortCodeHint") : text("pairWaitingReceiver")}</small>
    </div>
  );
}
