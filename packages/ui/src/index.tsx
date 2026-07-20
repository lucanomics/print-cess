import type { ButtonHTMLAttributes, PropsWithChildren, ReactNode } from "react";
import { Check, Printer } from "lucide-react";

export function Wordmark({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={compact ? "pc-wordmark pc-wordmark--compact" : "pc-wordmark"}
      aria-label="Print-cess by Paradiso"
    >
      <Printer aria-hidden="true" strokeWidth={2.2} />
      <span>
        <strong>Print-cess</strong> <small>by Paradiso</small>
      </span>
    </div>
  );
}

export function PrimaryButton({
  children,
  className = "",
  ...properties
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button className={`pc-button pc-button--primary ${className}`.trim()} {...properties}>
      {children}
    </button>
  );
}

export function SecondaryButton({
  children,
  className = "",
  ...properties
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button className={`pc-button pc-button--secondary ${className}`.trim()} {...properties}>
      {children}
    </button>
  );
}

export function ProgressSteps({
  current,
  total,
  label,
}: {
  current: number;
  total: number;
  label: string;
}) {
  return (
    <div
      className="pc-progress"
      aria-label={label}
      role="progressbar"
      aria-valuemin={1}
      aria-valuemax={total}
      aria-valuenow={current}
    >
      <div className="pc-progress__track" aria-hidden="true">
        {Array.from({ length: total }, (_, index) => (
          <span
            key={index}
            className={index + 1 <= current ? "pc-progress__dot is-active" : "pc-progress__dot"}
          >
            {index + 1 < current ? <Check size={14} strokeWidth={3} /> : null}
          </span>
        ))}
      </div>
      <span className="pc-progress__label">{label}</span>
    </div>
  );
}

export function ScreenShell({ children, footer }: PropsWithChildren<{ footer?: ReactNode }>) {
  return (
    <main className="pc-screen-shell">
      <div className="pc-screen-shell__body">{children}</div>
      {footer ? <div className="pc-screen-shell__footer">{footer}</div> : null}
    </main>
  );
}

export function StatusIcon({
  tone = "info",
  children,
}: PropsWithChildren<{ tone?: "info" | "success" | "error" }>) {
  return <span className={`pc-status-icon pc-status-icon--${tone}`}>{children}</span>;
}
