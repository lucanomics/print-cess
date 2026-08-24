import {
  derivePairingSecret,
  exportPublicKeyBase64Url,
  generateEcdhKeyPair,
  generateToken,
  hashToken,
  openTransferCode,
  sealTransferCode,
  type PairingSecret,
} from "@print-cess/crypto";
import {
  PAIRING_SHAPES,
  type PairingReceiverView,
  type PairingSenderView,
  type PairingShape,
} from "@print-cess/protocol";

import { ApiClientError } from "./api-client";

/**
 * The two phones' side of the short-code hand-off. The service relays public
 * keys and one sealed envelope; everything that could open a file is derived
 * here, on the device.
 */

const POLL_INTERVAL_MS = 1_500;

export type SenderPairing = {
  code: string;
  token: string;
  privateKey: CryptoKey;
  publicKey: string;
  expiresAt: number;
};

export type ReceiverPairing = {
  code: string;
  token: string;
  secret: PairingSecret;
  expiresAt: number;
};

async function pairingJson<T>(url: string, init: RequestInit, signal?: AbortSignal): Promise<T> {
  const timeout = AbortSignal.timeout(15_000);
  const response = await fetch(url, {
    ...init,
    cache: "no-store",
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  });
  const body = (await response.json().catch(() => ({}))) as {
    error?: { code?: string; message?: string };
  } & T;
  if (!response.ok) {
    throw new ApiClientError(
      body.error?.code ?? "networkError",
      body.error?.message ?? "Request failed",
      response.status,
    );
  }
  return body;
}

/** Claims two digits to show the person standing next to you. */
export async function openPairing(signal?: AbortSignal): Promise<SenderPairing> {
  const keyPair = await generateEcdhKeyPair();
  const publicKey = await exportPublicKeyBase64Url(keyPair.publicKey);
  const token = generateToken(32);
  const claimed = await pairingJson<{ code: string; expiresAt: number }>(
    "/api/pairings",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        protocolVersion: 1,
        senderTokenHash: await hashToken(token, "pairing"),
        senderPublicKey: publicKey,
      }),
    },
    signal,
  );
  return {
    code: claimed.code,
    token,
    privateKey: keyPair.privateKey,
    publicKey,
    expiresAt: claimed.expiresAt,
  };
}

/**
 * Waits for somebody to type the digits, then derives the shape this phone
 * expects its human to pick. The shape is a property of the exchange, so a
 * relay that swapped either key produces a different one here than on the
 * other screen.
 */
export async function awaitReceiver(
  pairing: SenderPairing,
  signal: AbortSignal,
): Promise<PairingSecret> {
  for (;;) {
    const view = await pairingJson<PairingSenderView>(
      `/api/pairings/${pairing.code}`,
      { method: "GET", headers: { "x-print-cess-pairing-token": pairing.token } },
      signal,
    );
    if (view.receiverPublicKey) {
      return derivePairingSecret(pairing.privateKey, view.receiverPublicKey, {
        senderPublicKey: pairing.publicKey,
        receiverPublicKey: view.receiverPublicKey,
      });
    }
    await delay(POLL_INTERVAL_MS, signal);
  }
}

/**
 * Releases the transfer code, sealed so that only the phone on the other end of
 * this exchange can read it. Called only after the sending human picked the
 * shape, which is what a guesser can never arrange.
 */
export async function deliverTransferCode(
  pairing: SenderPairing,
  secret: PairingSecret,
  transferCode: string,
): Promise<void> {
  await pairingJson(`/api/pairings/${pairing.code}/deliver`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-print-cess-pairing-token": pairing.token,
    },
    body: JSON.stringify({ sealedCode: await sealTransferCode(secret, transferCode) }),
  });
}

export async function abandonPairing(pairing: SenderPairing): Promise<void> {
  await fetch(`/api/pairings/${pairing.code}`, {
    method: "DELETE",
    headers: { "x-print-cess-pairing-token": pairing.token },
    keepalive: true,
  }).catch(() => undefined);
}

/** The receiving phone's half: two digits in, a shape to show out. */
export async function joinPairing(code: string, signal?: AbortSignal): Promise<ReceiverPairing> {
  const keyPair = await generateEcdhKeyPair();
  const publicKey = await exportPublicKeyBase64Url(keyPair.publicKey);
  const token = generateToken(32);
  const view = await pairingJson<PairingReceiverView>(
    `/api/pairings/${code}/join`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        protocolVersion: 1,
        receiverTokenHash: await hashToken(token, "pairing"),
        receiverPublicKey: publicKey,
      }),
    },
    signal,
  );
  const secret = await derivePairingSecret(keyPair.privateKey, view.senderPublicKey, {
    senderPublicKey: view.senderPublicKey,
    receiverPublicKey: publicKey,
  });
  return { code, token, secret, expiresAt: view.expiresAt };
}

/** Polls until the sending human has picked the shape, then opens the envelope. */
export async function awaitTransferCode(
  pairing: ReceiverPairing,
  signal: AbortSignal,
): Promise<string> {
  for (;;) {
    const view = await pairingJson<PairingReceiverView>(
      `/api/pairings/${pairing.code}/sealed`,
      { method: "GET", headers: { "x-print-cess-pairing-token": pairing.token } },
      signal,
    );
    if (view.sealedCode) return openTransferCode(pairing.secret, view.sealedCode);
    await delay(POLL_INTERVAL_MS, signal);
  }
}

/**
 * The four shapes in a fixed order, with the expected one named separately.
 * The order never depends on the answer, so the position of a shape on screen
 * says nothing about which one is right.
 */
export function shapeChoices(): readonly PairingShape[] {
  return PAIRING_SHAPES;
}

function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}
