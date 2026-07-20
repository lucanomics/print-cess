using Paradiso.PrintCess.Core.Documents;
using Paradiso.PrintCess.Core.Printing;
using Paradiso.PrintCess.Infrastructure.Printing;
using Paradiso.PrintCess.Tests.Fixtures;

namespace Paradiso.PrintCess.Tests.Printing;

public sealed class PrintingTests : IDisposable
{
    private readonly string _temporaryDirectory = Path.Combine(Path.GetTempPath(), $"printcess-tests-{Guid.NewGuid():N}");

    [Fact]
    public async Task ConcurrentRequestsEnterEngineExactlyOnce()
    {
        using var document = ValidDocument();
        var engine = new CountingPrintEngine();
        var guardedEngine = new IdempotentPrintEngine(engine, new InMemoryPrintSubmissionJournal());
        var settings = PrintSettings.KioskDefault("Synthetic Printer");

        var results = await Task.WhenAll(Enumerable.Range(0, 16).Select(_ =>
            guardedEngine.PrintAsync(document, settings, CancellationToken.None)));

        Assert.Equal(1, engine.CallCount);
        Assert.Single(results, static result => result.Outcome == PrintOutcome.Submitted);
        Assert.Equal(15, results.Count(static result => result.Outcome == PrintOutcome.DuplicateBlocked));
    }

    [Fact]
    public async Task EngineFailureIsUncertainAndNeverAutomaticallyRetried()
    {
        using var document = ValidDocument();
        var engine = new ThrowingPrintEngine();
        var guardedEngine = new IdempotentPrintEngine(engine, new InMemoryPrintSubmissionJournal());

        var first = await guardedEngine.PrintAsync(document, PrintSettings.KioskDefault("Synthetic Printer"), CancellationToken.None);
        var second = await guardedEngine.PrintAsync(document, PrintSettings.KioskDefault("Synthetic Printer"), CancellationToken.None);

        Assert.Equal(PrintOutcome.SubmissionUncertain, first.Outcome);
        Assert.Equal(PrintOutcome.DuplicateBlocked, second.Outcome);
        Assert.Equal(1, engine.CallCount);
    }

    [Fact]
    public async Task ReadinessCallbackCrossesTheDurableIdempotencyGateExactlyOnce()
    {
        using var document = ValidDocument();
        var engine = new CountingPrintEngine();
        var guardedEngine = new IdempotentPrintEngine(engine, new InMemoryPrintSubmissionJournal());
        var callbackCalls = 0;

        var result = await guardedEngine.PrintAsync(
            document,
            PrintSettings.KioskDefault("Synthetic Printer"),
            CancellationToken.None,
            _ =>
            {
                Interlocked.Increment(ref callbackCalls);
                return Task.CompletedTask;
            });

        Assert.Equal(PrintOutcome.Submitted, result.Outcome);
        Assert.Equal(1, callbackCalls);
        Assert.Equal(1, engine.CallCount);
    }

    [Fact]
    public async Task MockEngineRequiresExplicitOptInAndWritesMetadataOnlyArtifact()
    {
        using var document = ValidDocument();
        var disabled = new MockPrintEngine(new MockPrintEngineOptions(false, _temporaryDirectory));
        var rejected = await disabled.PrintAsync(document, PrintSettings.KioskDefault("Mock Printer"), CancellationToken.None);
        Assert.Equal(PrintOutcome.RejectedBeforeSubmission, rejected.Outcome);

        var enabled = new MockPrintEngine(new MockPrintEngineOptions(true, _temporaryDirectory));
        var result = await enabled.PrintAsync(document, PrintSettings.KioskDefault("Mock Printer"), CancellationToken.None);
        var artifact = Assert.Single(Directory.GetFiles(_temporaryDirectory, "*.json"));
        var json = await File.ReadAllTextAsync(artifact);

        Assert.Equal(PrintOutcome.Completed, result.Outcome);
        Assert.Contains("Print-cess by Paradiso", json, StringComparison.Ordinal);
        Assert.Contains("\"copies\": 1", json, StringComparison.Ordinal);
        Assert.DoesNotContain("/Type /Catalog", json, StringComparison.Ordinal);
        Assert.DoesNotContain(TestDocuments.SessionId, json, StringComparison.Ordinal);
    }

    [Fact]
    public void PrintSettingsRejectAnyUserConfigurableVariation()
    {
        PrintSettings.KioskDefault("Configured Printer").EnsureKioskPolicy();
        Assert.Throws<PrintPolicyException>(() => (PrintSettings.KioskDefault("Configured Printer") with { Copies = 2 }).EnsureKioskPolicy());
        Assert.Throws<PrintPolicyException>(() => (PrintSettings.KioskDefault("Configured Printer") with { Duplex = true }).EnsureKioskPolicy());
        Assert.Throws<PrintPolicyException>(() => (PrintSettings.KioskDefault("Configured Printer") with { Grayscale = false }).EnsureKioskPolicy());
        Assert.Throws<PrintPolicyException>(() => (PrintSettings.KioskDefault("Configured Printer") with { FitToPage = false }).EnsureKioskPolicy());
    }

    public void Dispose()
    {
        if (Directory.Exists(_temporaryDirectory))
        {
            Directory.Delete(_temporaryDirectory, recursive: true);
        }
    }

    private static ValidatedDocument ValidDocument() => new PortableDocumentValidator().Validate(
        TestDocuments.OnePagePdf(),
        DocumentKind.Pdf,
        "application/pdf",
        TestDocuments.SessionId);

    private sealed class CountingPrintEngine : IPrintEngine
    {
        private int _callCount;

        public int CallCount => _callCount;

        public async Task<PrintResult> PrintAsync(
            ValidatedDocument document,
            PrintSettings settings,
            CancellationToken cancellationToken,
            Func<CancellationToken, Task>? onReadyToSubmit = null)
        {
            Interlocked.Increment(ref _callCount);
            if (onReadyToSubmit is not null)
            {
                await onReadyToSubmit(cancellationToken);
            }

            await Task.Delay(25, cancellationToken);
            return PrintResult.Submitted();
        }
    }

    private sealed class ThrowingPrintEngine : IPrintEngine
    {
        public int CallCount { get; private set; }

        public Task<PrintResult> PrintAsync(
            ValidatedDocument document,
            PrintSettings settings,
            CancellationToken cancellationToken,
            Func<CancellationToken, Task>? onReadyToSubmit = null)
        {
            CallCount++;
            throw new InvalidOperationException("Synthetic engine failure");
        }
    }
}
