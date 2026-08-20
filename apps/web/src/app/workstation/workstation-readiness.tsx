"use client";

import { CheckCircle2, CircleAlert, LoaderCircle, ShieldAlert } from "lucide-react";
import { useEffect, useState } from "react";

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
  const [checks, setChecks] = useState<ReadinessCheck[] | null>(null);

  useEffect(() => {
    const anchor = document.createElement("a");
    setChecks([
      {
        key: "secure-context",
        label: copy.secureContext,
        ok: window.isSecureContext,
        required: true,
      },
      {
        key: "web-crypto",
        label: copy.webCrypto,
        ok: Boolean(globalThis.crypto?.subtle),
        required: true,
      },
      {
        key: "file-api",
        label: copy.fileApi,
        ok: typeof File !== "undefined" && typeof Blob !== "undefined" && typeof FileReader !== "undefined",
        required: true,
      },
      {
        key: "download-api",
        label: copy.downloadApi,
        ok: "download" in anchor,
        required: false,
      },
    ]);
  }, [copy]);

  if (!checks) {
    return (
      <section className="workstation-readiness" aria-live="polite">
        <div className="workstation-readiness__headline">
          <LoaderCircle className="workstation-readiness__spinner" aria-hidden="true" />
          <strong>{copy.checking}</strong>
        </div>
      </section>
    );
  }

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
      {requiredFailure ? <p>{copy.blockedHint}</p> : optionalFailure ? <p>{copy.limitedHint}</p> : null}
    </section>
  );
}
