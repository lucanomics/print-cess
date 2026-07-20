using Paradiso.PrintCess.Core.Printing;
using Paradiso.PrintCess.Infrastructure.Admin;

namespace Paradiso.PrintCess.Kiosk;

public sealed record KioskAdminDiagnostics(
    bool IsRunning,
    bool HasActiveSession,
    bool CurrentSessionConsumed,
    string PrinterName,
    IReadOnlyList<string> AvailablePrinterNames,
    PrinterState PrinterState,
    bool UsesMockPrinter,
    bool AdminServerOperationsConfigured,
    AdminServiceHealth ServiceHealth,
    DateTimeOffset? LastServerSuccessUtc,
    DateTimeOffset? LastBlobSuccessUtc,
    DateTimeOffset? LastCleanupAcknowledgedUtc);

public sealed record KioskForceDiscardResult(bool HadActiveSession, bool CleanupConfirmed);

public sealed record KioskPrinterSelectionResult(bool Changed, bool CleanupConfirmed, string PrinterName);

public interface IKioskAdminRuntime : IDisposable
{
    KioskAdminDiagnostics GetDiagnostics();

    Task<AdminServiceHealth> RefreshServiceHealthAsync(CancellationToken cancellationToken);

    Task<AdminOrphanSweepResult> SweepDueOrphansAsync(int limit, CancellationToken cancellationToken);

    Task<KioskPrinterSelectionResult> SelectPrinterAsync(string printerName, CancellationToken cancellationToken);

    Task<KioskForceDiscardResult> ForceDiscardCurrentSessionAsync();

    Task<PrintResult> PrintTestPageAsync(CancellationToken cancellationToken);
}
