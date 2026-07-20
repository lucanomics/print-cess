using Paradiso.PrintCess.Core.Printing;
using Paradiso.PrintCess.Infrastructure.Recovery;

namespace Paradiso.PrintCess.Tests.Recovery;

public sealed class RecoveryTests : IDisposable
{
    private readonly string _temporaryDirectory = Path.Combine(Path.GetTempPath(), $"printcess-journal-{Guid.NewGuid():N}");

    [Fact]
    public async Task RestartBlocksUnresolvedSubmissionAndNeverReleasesKey()
    {
        var firstProcess = new FilePrintSubmissionJournal(_temporaryDirectory);
        Assert.True(await firstProcess.TryCreateStartedAsync(Fixtures.TestDocuments.SessionId, CancellationToken.None));

        var restartedProcess = new FilePrintSubmissionJournal(_temporaryDirectory);
        var report = await new PrintRecoveryService(restartedProcess).RecoverAsync(CancellationToken.None);
        var record = Assert.Single(await restartedProcess.ReadAllAsync(CancellationToken.None));

        Assert.True(report.Succeeded);
        Assert.Equal(1, report.BlockedSubmissions);
        Assert.Equal(PrintJournalState.RecoveryBlocked, record.State);
        Assert.False(await restartedProcess.TryCreateStartedAsync(Fixtures.TestDocuments.SessionId, CancellationToken.None));
        Assert.DoesNotContain(Fixtures.TestDocuments.SessionId, await File.ReadAllTextAsync(Directory.GetFiles(_temporaryDirectory, "*.json").Single()), StringComparison.Ordinal);

        var secondRestart = await new PrintRecoveryService(new FilePrintSubmissionJournal(_temporaryDirectory))
            .RecoverAsync(CancellationToken.None);
        Assert.Equal(1, secondRestart.BlockedSubmissions);

        Assert.Equal(1, await restartedProcess.ResolveBlockedAsync(CancellationToken.None));
        record = Assert.Single(await restartedProcess.ReadAllAsync(CancellationToken.None));
        Assert.Equal(PrintJournalState.AdminResolved, record.State);
        Assert.False(await restartedProcess.TryCreateStartedAsync(Fixtures.TestDocuments.SessionId, CancellationToken.None));
        Assert.Equal(1, await restartedProcess.PruneTerminalAsync(DateTimeOffset.UtcNow.AddMinutes(1), CancellationToken.None));
    }

    [Fact]
    public async Task CorruptJournalFailsClosed()
    {
        Directory.CreateDirectory(_temporaryDirectory);
        await File.WriteAllTextAsync(Path.Combine(_temporaryDirectory, "bad.json"), "not-json");
        var report = await new PrintRecoveryService(new FilePrintSubmissionJournal(_temporaryDirectory))
            .RecoverAsync(CancellationToken.None);
        Assert.False(report.Succeeded);
        Assert.Equal("RECOVERY-FAILED", report.SafeCode);
    }

    public void Dispose()
    {
        if (Directory.Exists(_temporaryDirectory))
        {
            Directory.Delete(_temporaryDirectory, recursive: true);
        }
    }
}
