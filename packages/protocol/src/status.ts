export const PRINT_SESSION_STATUSES = [
  "waiting",
  "claimed",
  "upload_authorized",
  "uploading",
  "uploaded",
  "consumed",
  "validating",
  "printing",
  "completed",
  "failed",
  "expired",
  "cancelled",
] as const;

export type PrintSessionStatus = (typeof PRINT_SESSION_STATUSES)[number];

export const TERMINAL_SESSION_STATUSES = new Set<PrintSessionStatus>([
  "completed",
  "failed",
  "expired",
  "cancelled",
]);

const TRANSITIONS: Readonly<Record<PrintSessionStatus, ReadonlySet<PrintSessionStatus>>> = {
  waiting: new Set(["claimed", "expired", "cancelled"]),
  claimed: new Set(["upload_authorized", "expired", "cancelled", "failed"]),
  upload_authorized: new Set(["uploading", "expired", "cancelled", "failed"]),
  uploading: new Set(["uploaded", "expired", "cancelled", "failed"]),
  uploaded: new Set(["consumed", "expired", "cancelled", "failed"]),
  consumed: new Set(["validating", "failed", "expired"]),
  validating: new Set(["printing", "failed"]),
  printing: new Set(["completed", "failed"]),
  completed: new Set(),
  failed: new Set(),
  expired: new Set(),
  cancelled: new Set(),
};

export function canTransition(from: PrintSessionStatus, to: PrintSessionStatus): boolean {
  return TRANSITIONS[from].has(to);
}

export function assertTransition(from: PrintSessionStatus, to: PrintSessionStatus): void {
  if (!canTransition(from, to)) {
    throw new InvalidSessionTransitionError(from, to);
  }
}

export class InvalidSessionTransitionError extends Error {
  public constructor(
    public readonly from: PrintSessionStatus,
    public readonly to: PrintSessionStatus,
  ) {
    super(`Invalid print session transition: ${from} -> ${to}`);
    this.name = "InvalidSessionTransitionError";
  }
}
