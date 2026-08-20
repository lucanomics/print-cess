"use client";

import { CheckCircle2, CircleAlert, LoaderCircle, ShieldAlert } from "lucide-react";
import { useSyncExternalStore } from "react";

type Copy = {
  checking: string;
  ready: string;
  limited: string;
  blocked: string;
  secureContext: string;
  webCrypto: string;
  fileApi: string;
  downloadApi: string;
  pass: string;
  fail: string;
  blockedHint: string;
  limitedHint: string;
};

type ReadinessCheck = {
  key: string;
  label: string;
  ok: boolean;
  required: boolean;
};

export function WorkstationReadiness({ copy }: { copy: Copy }) {
  const hydrated = useSyncExternalStore(subscribeNever, readHydrated, readNotHydrated);
  const secureContext = useSyncExternalStore(subscribeNever, readSecureContext, readNotHydrated);
  const webCrypto = useSyncExternalStore(subscribeNever, readWebCrypto, readNotHydrated);
  const fileApi = useSyncExternalStore(subscribeNever, readFileApi, readNotHydrated);
  const downloadApi = useSyncExternalStore(subscribeNever, readDownloadApi, readNotHydrated);

  if (!hydrated) {
    return (
      <section className="workstation-readiness" aria-live="polite">
        <div className="workstation-readiness__headline">
          <LoaderCircle className="workstation-readiness__spinner" aria-hidden="true" />
          <strong>{copy.checking}</strong>
        </div>
      </section>
    );
  }

  const checks: ReadinessCheck[] = [
    { key: "secure-context", label: copy.secureContext, ok: secureContext, required: true },
    { key: "web-crypto", label: copy.webCrypto, ok: webCrypto, required: true },
    { key: "file-api", label: copy.fileApi, ok: fileApi, required: true },
    { key: "download-api", label: copy.downloadApi, ok: downloadApi, required: false },
  ];
  const requiredFailure = checks.some((check) => check.required && !check.ok);
  const optionalFailure = checks.some((check) => !check.required && !check.ok);
  const tone = requiredFailure ? "blocked" : optionalFailure ? "limited" : "ready";
  const title = requiredFailure ? copy.blocked : optionalFailure ? copy.limited : copy.ready;
  const Icon = requiredFailure ? ShieldAlert : optionalFailure ? CircleAlert : CheckCircle2;

  return (
    <section className={`workstation-readiness workstation-readiness--${tone}`} aria-live="polite">
      <div className="workstation-readiness__headline">
        <Icon aria-hidden="true" />
        <strong>{title}</strong>
      </div>
      <ul>
        {checks.map((check) => (
          <li key={check.key} className={check.ok ? "is-pass" : "is-fail"}>
            <span>{check.label}</span>
            <strong>{check.ok ? copy.pass : copy.fail}</strong>
          </li>
        ))}
      </ul>
      {requiredFailure ? (
        <p>{copy.blockedHint}</p>
      ) : optionalFailure ? (
        <p>{copy.limitedHint}</p>
      ) : null}
    </section>
  );
}

function subscribeNever(): () => void {
  return () => undefined;
}

function readHydrated(): boolean {
  return true;
}

function readNotHydrated(): boolean {
  return false;
}

function readSecureContext(): boolean {
  return window.isSecureContext;
}

function readWebCrypto(): boolean {
  return Boolean(globalThis.crypto?.subtle);
}

function readFileApi(): boolean {
  return (
    typeof File !== "undefined" &&
    typeof Blob !== "undefined" &&
    typeof FileReader !== "undefined"
  );
}

function readDownloadApi(): boolean {
  return "download" in document.createElement("a");
}
