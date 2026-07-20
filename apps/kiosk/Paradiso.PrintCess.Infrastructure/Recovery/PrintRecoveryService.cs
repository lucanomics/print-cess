using System.IO;
using System.Text.Json;
using Paradiso.PrintCess.Core.Printing;

namespace Paradiso.PrintCess.Infrastructure.Recovery;

public sealed class PrintRecoveryService
{
    private readonly IPrintSubmissionJournal _journal;

    public PrintRecoveryService(IPrintSubmissionJournal journal)
    {
        _journal = journal;
    }

    public async Task<PrintRecoveryReport> RecoverAsync(CancellationToken cancellationToken)
    {
        try
        {
            _ = await _journal.BlockUnresolvedAsync(cancellationToken).ConfigureAwait(false);
            var pruned = await _journal.PruneTerminalAsync(
                DateTimeOffset.UtcNow - TimeSpan.FromDays(1),
                cancellationToken).ConfigureAwait(false);
            var records = await _journal.ReadAllAsync(cancellationToken).ConfigureAwait(false);
            var blocked = records.Count(static record => record.State == PrintJournalState.RecoveryBlocked);
            return new PrintRecoveryReport(
                Succeeded: true,
                BlockedSubmissions: blocked,
                SafeCode: "RECOVERY-OK",
                PrunedRecords: pruned);
        }
        catch (Exception exception) when (exception is IOException or UnauthorizedAccessException or InvalidDataException or JsonException)
        {
            return new PrintRecoveryReport(Succeeded: false, BlockedSubmissions: 0, SafeCode: "RECOVERY-FAILED");
        }
    }
}

public sealed record PrintRecoveryReport(
    bool Succeeded,
    int BlockedSubmissions,
    string SafeCode,
    int PrunedRecords = 0);
