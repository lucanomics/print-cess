using System.Collections.Concurrent;

namespace Paradiso.PrintCess.Core.Printing;

public enum PrintJournalState
{
    SubmissionStarted,
    Submitted,
    Completed,
    RejectedBeforeSubmission,
    SubmissionUncertain,
    RecoveryBlocked,
    AdminResolved,
}

public sealed record PrintJournalRecord(
    string KeyHash,
    PrintJournalState State,
    DateTimeOffset UpdatedAtUtc,
    string SafeCode);

public interface IPrintSubmissionJournal
{
    Task<bool> TryCreateStartedAsync(string idempotencyKey, CancellationToken cancellationToken);

    Task UpdateAsync(
        string idempotencyKey,
        PrintJournalState state,
        string safeCode,
        CancellationToken cancellationToken);

    Task<IReadOnlyList<PrintJournalRecord>> ReadAllAsync(CancellationToken cancellationToken);

    Task<int> BlockUnresolvedAsync(CancellationToken cancellationToken);

    Task<int> ResolveBlockedAsync(CancellationToken cancellationToken);

    Task<int> PruneTerminalAsync(DateTimeOffset olderThanUtc, CancellationToken cancellationToken);
}

public sealed class InMemoryPrintSubmissionJournal : IPrintSubmissionJournal
{
    private readonly ConcurrentDictionary<string, PrintJournalRecord> _records = new(StringComparer.Ordinal);

    public Task<bool> TryCreateStartedAsync(string idempotencyKey, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var keyHash = PrintJournalKey.Hash(idempotencyKey);
        var record = new PrintJournalRecord(
            keyHash,
            PrintJournalState.SubmissionStarted,
            DateTimeOffset.UtcNow,
            "STARTED");
        return Task.FromResult(_records.TryAdd(keyHash, record));
    }

    public Task UpdateAsync(
        string idempotencyKey,
        PrintJournalState state,
        string safeCode,
        CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var keyHash = PrintJournalKey.Hash(idempotencyKey);
        if (!_records.TryGetValue(keyHash, out var current))
        {
            throw new InvalidOperationException("A print journal record must be created before it is updated.");
        }

        if (!PrintJournalTransitions.IsAllowed(current.State, state))
        {
            throw new InvalidOperationException($"Invalid print journal transition: {current.State} -> {state}.");
        }

        _records[keyHash] = new PrintJournalRecord(keyHash, state, DateTimeOffset.UtcNow, safeCode);
        return Task.CompletedTask;
    }

    public Task<IReadOnlyList<PrintJournalRecord>> ReadAllAsync(CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        IReadOnlyList<PrintJournalRecord> result = _records.Values
            .OrderBy(static record => record.UpdatedAtUtc)
            .ToArray();
        return Task.FromResult(result);
    }

    public Task<int> BlockUnresolvedAsync(CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var blocked = 0;
        foreach (var pair in _records.ToArray())
        {
            if (pair.Value.State is not (PrintJournalState.SubmissionStarted or PrintJournalState.Submitted or PrintJournalState.SubmissionUncertain))
            {
                continue;
            }

            var replacement = pair.Value with
            {
                State = PrintJournalState.RecoveryBlocked,
                SafeCode = "RECOVERY-BLOCKED",
                UpdatedAtUtc = DateTimeOffset.UtcNow,
            };
            if (_records.TryUpdate(pair.Key, replacement, pair.Value))
            {
                blocked++;
            }
        }

        return Task.FromResult(blocked);
    }

    public Task<int> ResolveBlockedAsync(CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var resolved = 0;
        foreach (var pair in _records.ToArray())
        {
            if (pair.Value.State != PrintJournalState.RecoveryBlocked)
            {
                continue;
            }

            var replacement = pair.Value with
            {
                State = PrintJournalState.AdminResolved,
                SafeCode = "ADMIN-RESOLVED",
                UpdatedAtUtc = DateTimeOffset.UtcNow,
            };
            if (_records.TryUpdate(pair.Key, replacement, pair.Value))
            {
                resolved++;
            }
        }

        return Task.FromResult(resolved);
    }

    public Task<int> PruneTerminalAsync(DateTimeOffset olderThanUtc, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var pruned = 0;
        foreach (var pair in _records.ToArray())
        {
            if (pair.Value.UpdatedAtUtc >= olderThanUtc ||
                pair.Value.State is not (PrintJournalState.Completed or PrintJournalState.RejectedBeforeSubmission or PrintJournalState.AdminResolved))
            {
                continue;
            }

            if (_records.TryRemove(pair.Key, out _))
            {
                pruned++;
            }
        }

        return Task.FromResult(pruned);
    }
}

public static class PrintJournalKey
{
    public static string Hash(string idempotencyKey)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(idempotencyKey);
        return Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(
            System.Text.Encoding.UTF8.GetBytes(idempotencyKey))).ToLowerInvariant();
    }
}

internal static class PrintJournalTransitions
{
    public static bool IsAllowed(PrintJournalState from, PrintJournalState to) => (from, to) switch
    {
        (PrintJournalState.SubmissionStarted, PrintJournalState.Submitted) => true,
        (PrintJournalState.SubmissionStarted, PrintJournalState.Completed) => true,
        (PrintJournalState.SubmissionStarted, PrintJournalState.RejectedBeforeSubmission) => true,
        (PrintJournalState.SubmissionStarted, PrintJournalState.SubmissionUncertain) => true,
        (PrintJournalState.SubmissionStarted, PrintJournalState.RecoveryBlocked) => true,
        (PrintJournalState.Submitted, PrintJournalState.Completed) => true,
        (PrintJournalState.Submitted, PrintJournalState.SubmissionUncertain) => true,
        (PrintJournalState.Submitted, PrintJournalState.RecoveryBlocked) => true,
        (PrintJournalState.SubmissionUncertain, PrintJournalState.RecoveryBlocked) => true,
        (PrintJournalState.RecoveryBlocked, PrintJournalState.AdminResolved) => true,
        _ => false,
    };
}
