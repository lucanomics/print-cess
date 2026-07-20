using Paradiso.PrintCess.Core.Protocol;

namespace Paradiso.PrintCess.Core.Sessions;

public static class PrintSessionStateMachine
{
    private static readonly Dictionary<PrintSessionStatus, HashSet<PrintSessionStatus>> Transitions =
        new()
        {
            [PrintSessionStatus.Waiting] = Set(PrintSessionStatus.Claimed, PrintSessionStatus.Expired, PrintSessionStatus.Cancelled),
            [PrintSessionStatus.Claimed] = Set(PrintSessionStatus.UploadAuthorized, PrintSessionStatus.Expired, PrintSessionStatus.Cancelled, PrintSessionStatus.Failed),
            [PrintSessionStatus.UploadAuthorized] = Set(PrintSessionStatus.Uploading, PrintSessionStatus.Expired, PrintSessionStatus.Cancelled, PrintSessionStatus.Failed),
            [PrintSessionStatus.Uploading] = Set(PrintSessionStatus.Uploaded, PrintSessionStatus.Expired, PrintSessionStatus.Cancelled, PrintSessionStatus.Failed),
            [PrintSessionStatus.Uploaded] = Set(PrintSessionStatus.Consumed, PrintSessionStatus.Expired, PrintSessionStatus.Cancelled, PrintSessionStatus.Failed),
            [PrintSessionStatus.Consumed] = Set(PrintSessionStatus.Validating, PrintSessionStatus.Failed, PrintSessionStatus.Expired),
            [PrintSessionStatus.Validating] = Set(PrintSessionStatus.Printing, PrintSessionStatus.Failed),
            [PrintSessionStatus.Printing] = Set(PrintSessionStatus.Completed, PrintSessionStatus.Failed),
            [PrintSessionStatus.Completed] = Set(),
            [PrintSessionStatus.Failed] = Set(),
            [PrintSessionStatus.Expired] = Set(),
            [PrintSessionStatus.Cancelled] = Set(),
        };

    public static bool CanTransition(PrintSessionStatus from, PrintSessionStatus to) =>
        Transitions.TryGetValue(from, out var allowed) && allowed.Contains(to);

    public static void EnsureTransition(PrintSessionStatus from, PrintSessionStatus to)
    {
        if (!CanTransition(from, to))
        {
            throw new InvalidSessionTransitionException(from, to);
        }
    }

    public static bool IsTerminal(PrintSessionStatus status) =>
        status is PrintSessionStatus.Completed or PrintSessionStatus.Failed or PrintSessionStatus.Expired or PrintSessionStatus.Cancelled;

    private static HashSet<PrintSessionStatus> Set(params PrintSessionStatus[] values) =>
        new HashSet<PrintSessionStatus>(values);
}

public sealed class InvalidSessionTransitionException : InvalidOperationException
{
    public InvalidSessionTransitionException(PrintSessionStatus from, PrintSessionStatus to)
        : base($"Invalid print session transition: {from} -> {to}.")
    {
        From = from;
        To = to;
    }

    public PrintSessionStatus From { get; }

    public PrintSessionStatus To { get; }
}
