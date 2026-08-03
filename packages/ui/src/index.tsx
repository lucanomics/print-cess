import type {
  ButtonHTMLAttributes,
  CSSProperties,
  PropsWithChildren,
  ReactNode,
} from "react";
import { Check } from "lucide-react";

export function PrintcessMark({ className = "" }: { className?: string }) {
  return (
    <svg
      className={`pc-mark ${className}`.trim()}
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path className="pc-mark__paper" d="M18 28V15l7 4 7-10 7 10 7-4v13H18Z" />
      <rect className="pc-mark__body" x="7" y="24" width="50" height="29" rx="8" />
      <path className="pc-mark__sheet" d="M18 39h28v18H18z" />
      <path className="pc-mark__detail" d="M23 47h18" />
      <circle className="pc-mark__status" cx="48" cy="33" r="2.5" />
    </svg>
  );
}

export function Wordmark({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={compact ? "pc-wordmark pc-wordmark--compact" : "pc-wordmark"}
      aria-label="Print-cess by Paradiso"
    >
      <PrintcessMark />
      <span>
        <strong>
          Print<span className="pc-wordmark__hyphen">-</span>cess
        </strong>{" "}
        <small>by Paradiso</small>
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
      <div
        className="pc-progress__track"
        aria-hidden="true"
        style={{ "--pc-progress-total": total } as CSSProperties}
      >
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
