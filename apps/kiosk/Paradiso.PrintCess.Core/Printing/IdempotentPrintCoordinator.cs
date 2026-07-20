namespace Paradiso.PrintCess.Core.Printing;

public sealed class IdempotentPrintCoordinator
{
    private readonly IPrintEngine _engine;
    private readonly IPrintSubmissionJournal _journal;

    public IdempotentPrintCoordinator(IPrintEngine engine, IPrintSubmissionJournal journal)
    {
        _engine = engine;
        _journal = journal;
    }

    public async Task<PrintResult> PrintOnceAsync(
        Documents.ValidatedDocument document,
        PrintSettings settings,
        CancellationToken cancellationToken,
        Func<CancellationToken, Task>? onReadyToSubmit = null)
    {
        settings.EnsureKioskPolicy();
        if (!await _journal.TryCreateStartedAsync(document.IdempotencyKey, cancellationToken).ConfigureAwait(false))
        {
            return PrintResult.Duplicate();
        }

        try
        {
            var result = await _engine.PrintAsync(document, settings, cancellationToken, onReadyToSubmit).ConfigureAwait(false);
            var journalState = result.Outcome switch
            {
                PrintOutcome.Completed => PrintJournalState.Completed,
                PrintOutcome.Submitted => PrintJournalState.Submitted,
                PrintOutcome.RejectedBeforeSubmission => PrintJournalState.RejectedBeforeSubmission,
                PrintOutcome.SubmissionUncertain => PrintJournalState.SubmissionUncertain,
                PrintOutcome.DuplicateBlocked => PrintJournalState.SubmissionUncertain,
                _ => PrintJournalState.SubmissionUncertain,
            };
            await _journal.UpdateAsync(document.IdempotencyKey, journalState, result.Code, CancellationToken.None)
                .ConfigureAwait(false);
            return result;
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            await _journal.UpdateAsync(
                document.IdempotencyKey,
                PrintJournalState.SubmissionUncertain,
                "P-04",
                CancellationToken.None).ConfigureAwait(false);
            throw;
        }
        catch
        {
            await _journal.UpdateAsync(
                document.IdempotencyKey,
                PrintJournalState.SubmissionUncertain,
                "P-04",
                CancellationToken.None).ConfigureAwait(false);
            return PrintResult.Uncertain();
        }
    }
}
