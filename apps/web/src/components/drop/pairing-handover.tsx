"use client";

import { useCallback, useEffect, useState } from "react";

import type { PairingShape } from "@print-cess/protocol";

import { openPairing, shapeChoices, type SenderPairing } from "@/lib/drop-pairing";
import type { Text } from "@/lib/use-visitor-locale";

import { PairingShapeMark, shapeLabel } from "./pairing-shape";

/**
 * The sender chooses the shared shape while the file uploads. The transfer
 * code is not escrowed and its three-minute clock does not start until the
 * upload seals. QR and shared links remain the private path.
 */
export function PairingHandover({
  transferCode,
  sealed,
  text,
}: {
  transferCode: string;
  sealed: boolean;
  text: Text;
}) {
  const [selected, setSelected] = useState<PairingShape>();
  const [pairing, setPairing] = useState<SenderPairing>();
  const [failed, setFailed] = useState(false);

  const pick = useCallback((shape: PairingShape) => {
    setSelected((current) => current ?? shape);
    setFailed(false);
  }, []);

  useEffect(() => {
    if (!sealed || !selected || pairing) return;
    const controller = new AbortController();
    void openPairing(transferCode, selected, controller.signal)
      .then(setPairing)
      .catch(() => {
        if (controller.signal.aborted) return;
        setSelected(undefined);
        setFailed(true);
      });
    return () => controller.abort();
  }, [pairing, sealed, selected, transferCode]);

  if (pairing) {
    return (
      <section className="pairing-created" aria-live="polite">
        <div className="pairing-digits">
          <span className="pairing-digits__label">{text("pairShortCode")}</span>
          <strong data-testid="pairing-code">{pairing.code}</strong>
          <small>{text("pairShortCodeHint")}</small>
        </div>
        <figure className="pairing-shown pairing-shown--selected">
          <div className="pairing-shown__figure" data-testid={`pairing-selected-${pairing.shape}`}>
            <PairingShapeMark shape={pairing.shape} />
          </div>
          <figcaption>{shapeLabel(pairing.shape, text)}</figcaption>
        </figure>
        <p className="drop-notice" role="status">
          {text(sealed ? "pairHandedOver" : "pairWaitingReceiver")}
        </p>
      </section>
    );
  }

  if (selected) {
    return (
      <section className="pairing-created" aria-live="polite">
        <figure className="pairing-shown pairing-shown--selected">
          <div className="pairing-shown__figure" data-testid={`pairing-selected-${selected}`}>
            <PairingShapeMark shape={selected} />
          </div>
          <figcaption>{shapeLabel(selected, text)}</figcaption>
        </figure>
        <p className="drop-notice" role="status">
          {text("pairWaitingReceiver")}
        </p>
      </section>
    );
  }

  return (
    <section className="pairing-pick">
      <h2>{text("pairPickShape")}</h2>
      <p>{text("pairPickShapeHint")}</p>
      {failed ? (
        <p className="drop-notice" role="alert">
          {text("dropNetworkError")}
        </p>
      ) : null}
      <div className="pairing-choices">
        {shapeChoices().map((choice) => (
          <button
            key={choice}
            type="button"
            onClick={() => pick(choice)}
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
