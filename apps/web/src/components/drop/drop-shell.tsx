"use client";

import { useCallback, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { Languages } from "lucide-react";

import {
  isRightToLeft,
  LOCALE_NAMES,
  matchLocale,
  SUPPORTED_LOCALES,
  translate,
  type SupportedLocale,
} from "@print-cess/i18n";
import { ScreenShell, Wordmark } from "@print-cess/ui";

export type Text = (key: string, values?: Record<string, string | number>) => string;

/**
 * The printing flow asks for a language on its own screen because the visitor
 * arrives from a shared kiosk with no context. Someone sending a file arrives
 * from their own phone, so the browser already knows the answer; the picker
 * stays available but never blocks the first screen.
 */
export function useDropLocale(
  initialLocale: SupportedLocale = "en",
): [SupportedLocale, (locale: SupportedLocale) => void, Text] {
  // The browser's preference is read as an external snapshot rather than in an
  // effect, so server rendering and hydration each have one defined answer.
  //
  // The server already resolved a language from `Accept-Language` and rendered
  // in it, so that is the snapshot to hand back during hydration. Defaulting to
  // English here instead would make a Korean visitor watch the page load in
  // English and then change under them.
  const detected = useSyncExternalStore(subscribeNever, readBrowserLocale, () => initialLocale);
  const [chosen, setChosen] = useState<SupportedLocale>();
  const locale = chosen ?? detected;
  const setLocale = useCallback((next: SupportedLocale) => setChosen(next), []);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = isRightToLeft(locale) ? "rtl" : "ltr";
  }, [locale]);

  const text = useCallback<Text>((key, values) => translate(locale, key, values), [locale]);
  return [locale, setLocale, text];
}

function subscribeNever(): () => void {
  // Language preferences do not change while a transfer screen is open.
  return () => {};
}

function readBrowserLocale(): SupportedLocale {
  return matchLocale(navigator.languages);
}

export function DropShell({
  locale,
  onLocaleChange,
  text,
  children,
}: {
  locale: SupportedLocale;
  onLocaleChange: (locale: SupportedLocale) => void;
  text: Text;
  children: ReactNode;
}) {
  return (
    <ScreenShell>
      <div className="mobile-topbar">
        <Wordmark compact />
        <label className="drop-language">
          <Languages aria-hidden="true" />
          <span className="drop-visually-hidden">{text("selectLanguage")}</span>
          <select
            value={locale}
            onChange={(event) => onLocaleChange(event.target.value as SupportedLocale)}
          >
            {SUPPORTED_LOCALES.map((candidate) => (
              <option key={candidate} value={candidate}>
                {LOCALE_NAMES[candidate]}
              </option>
            ))}
          </select>
        </label>
      </div>
      {children}
    </ScreenShell>
  );
}

export function TransferBar({
  progress,
  text,
  minutesRemaining,
}: {
  progress: { transferredBytes: number; totalBytes: number };
  text: Text;
  minutesRemaining?: number | null;
}) {
  const percent =
    progress.totalBytes > 0
      ? Math.min(100, Math.floor((progress.transferredBytes / progress.totalBytes) * 100))
      : 0;
  return (
    <div className="drop-progress">
      <div
        className="drop-progress__track"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-label={text("dropPercent", { percent })}
      >
        <span className="drop-progress__fill" style={{ inlineSize: `${percent}%` }} />
      </div>
      <p className="drop-progress__label">
        {text("dropPercent", { percent })} · {formatBytes(progress.transferredBytes)} /{" "}
        {formatBytes(progress.totalBytes)}
        {minutesRemaining ? ` · ${text("dropRemaining", { minutes: minutesRemaining })}` : ""}
      </p>
    </div>
  );
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 10 || unit === 0 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}

export function minutesUntil(timestamp: number, now = Date.now()): number {
  return Math.max(0, Math.ceil((timestamp - now) / 60_000));
}
