using System.IO;
using System.Text.Json;
using Paradiso.PrintCess.Core.Documents;
using Paradiso.PrintCess.Core.Printing;

namespace Paradiso.PrintCess.Infrastructure.Printing;

public sealed record MockPrintEngineOptions(bool Enabled, string ArtifactDirectory);

public sealed class MockPrintEngine : IPrintEngine
{
    private static readonly JsonSerializerOptions ArtifactJsonOptions = new(JsonSerializerDefaults.Web)
    {
        WriteIndented = true,
    };

    private readonly MockPrintEngineOptions _options;

    public MockPrintEngine(MockPrintEngineOptions options)
    {
        _options = options;
    }

    public async Task<PrintResult> PrintAsync(
        ValidatedDocument document,
        PrintSettings settings,
        CancellationToken cancellationToken,
        Func<CancellationToken, Task>? onReadyToSubmit = null)
    {
        ArgumentNullException.ThrowIfNull(document);
        settings.EnsureKioskPolicy();
        if (!_options.Enabled)
        {
            return PrintResult.Rejected("P-MOCK-DISABLED");
        }

        cancellationToken.ThrowIfCancellationRequested();
        if (onReadyToSubmit is not null)
        {
            await onReadyToSubmit(cancellationToken).ConfigureAwait(false);
        }

        Directory.CreateDirectory(_options.ArtifactDirectory);
        var artifact = new MockPrintArtifact(
            SchemaVersion: 1,
            Product: "Print-cess by Paradiso",
            CreatedAtUtc: DateTimeOffset.UtcNow,
            Kind: document.Kind.ToString().ToLowerInvariant(),
            Length: document.Content.Length,
            Pages: document.Properties.PageCount,
            PixelWidth: document.Properties.PixelWidth,
            PixelHeight: document.Properties.PixelHeight,
            Media: settings.Media,
            Copies: settings.Copies,
            Duplex: settings.Duplex,
            Grayscale: settings.Grayscale,
            FitToPage: settings.FitToPage);
        var path = Path.Combine(_options.ArtifactDirectory, $"mock-print-{Guid.NewGuid():N}.json");
        var json = JsonSerializer.Serialize(artifact, ArtifactJsonOptions);
        await File.WriteAllTextAsync(path, json, cancellationToken).ConfigureAwait(false);
        return PrintResult.Completed();
    }

    private sealed record MockPrintArtifact(
        int SchemaVersion,
        string Product,
        DateTimeOffset CreatedAtUtc,
        string Kind,
        int Length,
        int? Pages,
        int? PixelWidth,
        int? PixelHeight,
        string Media,
        int Copies,
        bool Duplex,
        bool Grayscale,
        bool FitToPage);
}
