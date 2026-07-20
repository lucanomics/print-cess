using System.Collections.Concurrent;
using System.IO;
using System.Text.Json;
using Paradiso.PrintCess.Core.Printing;

namespace Paradiso.PrintCess.Infrastructure.Recovery;

public sealed class FilePrintSubmissionJournal : IPrintSubmissionJournal
{
    private readonly string _directory;
    private readonly ConcurrentDictionary<string, SemaphoreSlim> _locks = new(StringComparer.Ordinal);
    private readonly JsonSerializerOptions _jsonOptions = new(JsonSerializerDefaults.Web)
    {
        WriteIndented = false,
    };

    public FilePrintSubmissionJournal(string directory)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(directory);
        _directory = Path.GetFullPath(directory);
        Directory.CreateDirectory(_directory);
    }

    public async Task<bool> TryCreateStartedAsync(string idempotencyKey, CancellationToken cancellationToken)
    {
        var keyHash = PrintJournalKey.Hash(idempotencyKey);
        var path = PathFor(keyHash);
        var record = new PrintJournalRecord(
            keyHash,
            PrintJournalState.SubmissionStarted,
            DateTimeOffset.UtcNow,
            "STARTED");

        try
        {
            await using var stream = new FileStream(
                path,
                FileMode.CreateNew,
                FileAccess.Write,
                FileShare.Read,
                bufferSize: 4_096,
                FileOptions.WriteThrough | FileOptions.Asynchronous);
            await JsonSerializer.SerializeAsync(stream, record, _jsonOptions, cancellationToken).ConfigureAwait(false);
            await stream.FlushAsync(cancellationToken).ConfigureAwait(false);
            stream.Flush(flushToDisk: true);
            return true;
        }
        catch (IOException) when (File.Exists(path))
        {
            return false;
        }
    }

    public async Task UpdateAsync(
        string idempotencyKey,
        PrintJournalState state,
        string safeCode,
        CancellationToken cancellationToken)
    {
        var keyHash = PrintJournalKey.Hash(idempotencyKey);
        await UpdateByHashAsync(keyHash, state, safeCode, cancellationToken).ConfigureAwait(false);
    }

    public async Task<IReadOnlyList<PrintJournalRecord>> ReadAllAsync(CancellationToken cancellationToken)
    {
        var records = new List<PrintJournalRecord>();
        foreach (var path in Directory.EnumerateFiles(_directory, "*.json", SearchOption.TopDirectoryOnly))
        {
            cancellationToken.ThrowIfCancellationRequested();
            await using var stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read);
            var record = await JsonSerializer.DeserializeAsync<PrintJournalRecord>(stream, _jsonOptions, cancellationToken)
                .ConfigureAwait(false);
            if (record is null || !string.Equals(Path.GetFileNameWithoutExtension(path), record.KeyHash, StringComparison.Ordinal))
            {
                throw new InvalidDataException("Print recovery journal integrity check failed.");
            }

            records.Add(record);
        }

        return records.OrderBy(static record => record.UpdatedAtUtc).ToArray();
    }

    public async Task<int> BlockUnresolvedAsync(CancellationToken cancellationToken)
    {
        var records = await ReadAllAsync(cancellationToken).ConfigureAwait(false);
        var blocked = 0;
        foreach (var record in records)
        {
            if (record.State is not (PrintJournalState.SubmissionStarted or PrintJournalState.Submitted or PrintJournalState.SubmissionUncertain))
            {
                continue;
            }

            await UpdateByHashAsync(
                record.KeyHash,
                PrintJournalState.RecoveryBlocked,
                "RECOVERY-BLOCKED",
                cancellationToken).ConfigureAwait(false);
            blocked++;
        }

        return blocked;
    }

    public async Task<int> ResolveBlockedAsync(CancellationToken cancellationToken)
    {
        var records = await ReadAllAsync(cancellationToken).ConfigureAwait(false);
        var resolved = 0;
        foreach (var record in records.Where(static record => record.State == PrintJournalState.RecoveryBlocked))
        {
            await UpdateByHashAsync(
                record.KeyHash,
                PrintJournalState.AdminResolved,
                "ADMIN-RESOLVED",
                cancellationToken).ConfigureAwait(false);
            resolved++;
        }

        return resolved;
    }

    public async Task<int> PruneTerminalAsync(DateTimeOffset olderThanUtc, CancellationToken cancellationToken)
    {
        var records = await ReadAllAsync(cancellationToken).ConfigureAwait(false);
        var pruned = 0;
        foreach (var record in records)
        {
            cancellationToken.ThrowIfCancellationRequested();
            if (record.UpdatedAtUtc >= olderThanUtc ||
                record.State is not (PrintJournalState.Completed or PrintJournalState.RejectedBeforeSubmission or PrintJournalState.AdminResolved))
            {
                continue;
            }

            var gate = _locks.GetOrAdd(record.KeyHash, static _ => new SemaphoreSlim(1, 1));
            await gate.WaitAsync(cancellationToken).ConfigureAwait(false);
            try
            {
                var path = PathFor(record.KeyHash);
                if (File.Exists(path))
                {
                    File.Delete(path);
                    pruned++;
                }
            }
            finally
            {
                gate.Release();
            }
        }

        return pruned;
    }

    private async Task UpdateByHashAsync(
        string keyHash,
        PrintJournalState state,
        string safeCode,
        CancellationToken cancellationToken)
    {
        if (safeCode.Length is < 1 or > 64 || safeCode.Any(static character => !char.IsAsciiLetterOrDigit(character) && character is not '-' and not '_'))
        {
            throw new ArgumentException("Journal codes must be short, non-sensitive identifiers.", nameof(safeCode));
        }

        var gate = _locks.GetOrAdd(keyHash, static _ => new SemaphoreSlim(1, 1));
        await gate.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            var path = PathFor(keyHash);
            PrintJournalRecord current;
            await using (var read = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read))
            {
                current = await JsonSerializer.DeserializeAsync<PrintJournalRecord>(read, _jsonOptions, cancellationToken)
                    .ConfigureAwait(false) ?? throw new InvalidDataException("Print journal record is empty.");
            }

            EnsureTransition(current.State, state);
            var replacement = current with
            {
                State = state,
                SafeCode = safeCode,
                UpdatedAtUtc = DateTimeOffset.UtcNow,
            };
            var temporaryPath = Path.Combine(_directory, $".{keyHash}.{Guid.NewGuid():N}.tmp");
            try
            {
                await using (var write = new FileStream(
                    temporaryPath,
                    FileMode.CreateNew,
                    FileAccess.Write,
                    FileShare.None,
                    4_096,
                    FileOptions.WriteThrough | FileOptions.Asynchronous))
                {
                    await JsonSerializer.SerializeAsync(write, replacement, _jsonOptions, cancellationToken).ConfigureAwait(false);
                    await write.FlushAsync(cancellationToken).ConfigureAwait(false);
                    write.Flush(flushToDisk: true);
                }

                File.Replace(temporaryPath, path, destinationBackupFileName: null, ignoreMetadataErrors: true);
            }
            finally
            {
                if (File.Exists(temporaryPath))
                {
                    File.Delete(temporaryPath);
                }
            }
        }
        finally
        {
            gate.Release();
        }
    }

    private string PathFor(string keyHash) => Path.Combine(_directory, $"{keyHash}.json");

    private static void EnsureTransition(PrintJournalState from, PrintJournalState to)
    {
        var allowed = (from, to) switch
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
        if (!allowed)
        {
            throw new InvalidOperationException($"Invalid print journal transition: {from} -> {to}.");
        }
    }
}
