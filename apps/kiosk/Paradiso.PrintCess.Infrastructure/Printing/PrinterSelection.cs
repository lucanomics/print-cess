using System.IO;
using System.Text.Json;
using System.Text.Json.Serialization;
using Paradiso.PrintCess.Core.Printing;

namespace Paradiso.PrintCess.Infrastructure.Printing;

public interface IPrinterCatalog
{
    IReadOnlyList<string> GetAvailablePrinterNames();

    PrinterState GetState(string printerName);
}

public interface IPrinterSelectionStore
{
    string? Load();

    void Save(string printerName);
}

public sealed class FixedPrinterCatalog : IPrinterCatalog
{
    private readonly string _printerName;
    private readonly PrinterState _state;

    public FixedPrinterCatalog(string printerName, PrinterState state)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(printerName);
        _printerName = printerName;
        _state = state;
    }

    public IReadOnlyList<string> GetAvailablePrinterNames() => [_printerName];

    public PrinterState GetState(string printerName) => string.Equals(printerName, _printerName, StringComparison.Ordinal)
        ? _state
        : PrinterState.Unknown;
}

public sealed class FilePrinterSelectionStore : IPrinterSelectionStore
{
    private const int MaximumFileBytes = 4 * 1024;
    private const int MaximumPrinterNameLength = 256;
    private readonly string _path;
    private readonly JsonSerializerOptions _jsonOptions = new(JsonSerializerDefaults.Web)
    {
        UnmappedMemberHandling = JsonUnmappedMemberHandling.Disallow,
    };

    public FilePrinterSelectionStore(string path)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(path);
        _path = Path.GetFullPath(path);
        Directory.CreateDirectory(Path.GetDirectoryName(_path)!);
    }

    public string? Load()
    {
        if (!File.Exists(_path))
        {
            return null;
        }

        try
        {
            using var stream = new FileStream(_path, FileMode.Open, FileAccess.Read, FileShare.Read);
            if (stream.Length is <= 0 or > MaximumFileBytes)
            {
                return null;
            }

            var selection = JsonSerializer.Deserialize<SelectionRecord>(stream, _jsonOptions);
            return selection is { Version: 1 } && IsValidPrinterName(selection.PrinterName)
                ? selection.PrinterName
                : null;
        }
        catch (Exception exception) when (exception is IOException or UnauthorizedAccessException or JsonException)
        {
            return null;
        }
    }

    public void Save(string printerName)
    {
        if (!IsValidPrinterName(printerName))
        {
            throw new ArgumentException("Printer name is invalid.", nameof(printerName));
        }

        var directory = Path.GetDirectoryName(_path)!;
        Directory.CreateDirectory(directory);
        var temporaryPath = Path.Combine(directory, $".{Path.GetFileName(_path)}.{Guid.NewGuid():N}.tmp");
        try
        {
            using (var stream = new FileStream(
                temporaryPath,
                FileMode.CreateNew,
                FileAccess.Write,
                FileShare.None,
                4_096,
                FileOptions.WriteThrough))
            {
                JsonSerializer.Serialize(stream, new SelectionRecord(1, printerName), _jsonOptions);
                stream.Flush(flushToDisk: true);
            }

            File.Move(temporaryPath, _path, overwrite: true);
        }
        finally
        {
            if (File.Exists(temporaryPath))
            {
                File.Delete(temporaryPath);
            }
        }
    }

    private static bool IsValidPrinterName(string? value) =>
        !string.IsNullOrWhiteSpace(value) &&
        value.Length <= MaximumPrinterNameLength &&
        !value.Any(char.IsControl);

    private sealed record SelectionRecord(int Version, string PrinterName);
}
