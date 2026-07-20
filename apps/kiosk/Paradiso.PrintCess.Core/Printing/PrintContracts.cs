using Paradiso.PrintCess.Core.Documents;

namespace Paradiso.PrintCess.Core.Printing;

public interface IPrintEngine
{
    Task<PrintResult> PrintAsync(
        ValidatedDocument document,
        PrintSettings settings,
        CancellationToken cancellationToken,
        Func<CancellationToken, Task>? onReadyToSubmit = null);
}

public sealed record PrintSettings(
    string PrinterName,
    string Media,
    int Copies,
    bool Duplex,
    bool Grayscale,
    bool FitToPage)
{
    public static PrintSettings KioskDefault(string printerName) =>
        new(printerName, "A4", 1, Duplex: false, Grayscale: true, FitToPage: true);

    public void EnsureKioskPolicy()
    {
        if (string.IsNullOrWhiteSpace(PrinterName) ||
            !string.Equals(Media, "A4", StringComparison.Ordinal) ||
            Copies != 1 || Duplex || !Grayscale || !FitToPage)
        {
            throw new PrintPolicyException("Print settings do not match the fixed kiosk policy.");
        }
    }
}

public enum PrintOutcome
{
    Submitted,
    Completed,
    RejectedBeforeSubmission,
    SubmissionUncertain,
    DuplicateBlocked,
}

public sealed record PrintResult(PrintOutcome Outcome, string Code)
{
    public bool WasSubmitted => Outcome is PrintOutcome.Submitted or PrintOutcome.Completed;

    public static PrintResult Submitted() => new(PrintOutcome.Submitted, "OK-SUBMITTED");

    public static PrintResult Completed() => new(PrintOutcome.Completed, "OK-COMPLETED");

    public static PrintResult Rejected(string code) => new(PrintOutcome.RejectedBeforeSubmission, code);

    public static PrintResult Uncertain() => new(PrintOutcome.SubmissionUncertain, "P-04");

    public static PrintResult Duplicate() => new(PrintOutcome.DuplicateBlocked, "P-04");
}

public enum PrinterState
{
    Ready,
    Offline,
    OutOfPaper,
    Paused,
    Error,
    Unknown,
}

public sealed class PrintPolicyException : InvalidOperationException
{
    public PrintPolicyException(string message)
        : base(message)
    {
    }
}
