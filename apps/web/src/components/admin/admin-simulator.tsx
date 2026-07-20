"use client";

import { useState } from "react";
import { Activity, LockKeyhole, Printer, RefreshCw, ServerCog, Volume2 } from "lucide-react";

import { PrimaryButton, SecondaryButton, Wordmark } from "@print-cess/ui";

type Diagnostics = Record<string, string>;

export function AdminSimulator() {
  const [secret, setSecret] = useState("");
  const [diagnostics, setDiagnostics] = useState<Diagnostics>();
  const [message, setMessage] = useState("Administrator authentication is required.");

  async function authenticate() {
    const response = await fetch("/api/demo/diagnostics", {
      headers: { "x-admin-secret": secret },
      cache: "no-store",
    });
    if (!response.ok) {
      setMessage(
        response.status === 503
          ? "ADMIN_DIAGNOSTICS_SECRET is not configured."
          : "Authentication failed.",
      );
      return;
    }
    setDiagnostics((await response.json()) as Diagnostics);
    setSecret("");
    setMessage("Authenticated. Sensitive credentials are not displayed.");
  }

  if (!diagnostics) {
    return (
      <main className="admin-login">
        <Wordmark compact />
        <LockKeyhole aria-hidden="true" />
        <h1>Administrator diagnostics</h1>
        <p>{message}</p>
        <label>
          Administrator secret
          <input
            type="password"
            autoComplete="current-password"
            value={secret}
            onChange={(event) => setSecret(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void authenticate();
            }}
          />
        </label>
        <PrimaryButton disabled={!secret} onClick={() => void authenticate()}>
          Open diagnostics
        </PrimaryButton>
      </main>
    );
  }

  return (
    <main className="admin-shell">
      <header>
        <Wordmark compact />
        <div>
          <Activity aria-hidden="true" />
          Development diagnostics
        </div>
      </header>
      <section className="admin-status">
        <h1>Service status</h1>
        <dl>
          {Object.entries(diagnostics).map(([key, value]) => (
            <div key={key}>
              <dt>{humanize(key)}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </section>
      <section className="admin-controls">
        <h2>Controlled actions</h2>
        <label>
          Printer
          <select defaultValue="mock">
            <option value="mock">MockPrintEngine (development only)</option>
          </select>
        </label>
        <SecondaryButton
          onClick={() => setMessage("Synthetic test page submitted to MockPrintEngine.")}
        >
          <Printer aria-hidden="true" /> Test print
        </SecondaryButton>
        <SecondaryButton onClick={() => speak("Print-cess audio test complete")}>
          <Volume2 aria-hidden="true" /> Audio test
        </SecondaryButton>
        <SecondaryButton onClick={() => window.location.reload()}>
          <RefreshCw aria-hidden="true" /> Restart simulator
        </SecondaryButton>
        <p role="status">{message}</p>
      </section>
      <aside>
        <ServerCog aria-hidden="true" /> Production diagnostics require a separately configured
        administrator hash and never expose document identifiers, filenames, tokens, keys, or signed
        URLs.
      </aside>
    </main>
  );
}

function humanize(value: string): string {
  return value.replace(/([A-Z])/gu, " $1").replace(/^./u, (character) => character.toUpperCase());
}
function speak(text: string) {
  try {
    speechSynthesis.cancel();
    speechSynthesis.speak(new SpeechSynthesisUtterance(text));
  } catch {
    /* Text status remains available. */
  }
}
