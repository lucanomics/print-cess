#if WINDOWS
using System.Printing;
using Paradiso.PrintCess.Core.Printing;

namespace Paradiso.PrintCess.Infrastructure.Printing;

public sealed class WindowsPrinterCatalog : IPrinterCatalog
{
    private readonly HashSet<string> _allowedPrinterNames;

    public WindowsPrinterCatalog(IEnumerable<string> allowedPrinterNames)
    {
        ArgumentNullException.ThrowIfNull(allowedPrinterNames);
        _allowedPrinterNames = allowedPrinterNames
            .Where(static name => !string.IsNullOrWhiteSpace(name))
            .ToHashSet(StringComparer.Ordinal);
        if (_allowedPrinterNames.Count == 0)
        {
            throw new ArgumentException("At least one approved printer name is required.", nameof(allowedPrinterNames));
        }
    }

    public IReadOnlyList<string> GetAvailablePrinterNames()
    {
        try
        {
            using var server = new LocalPrintServer();
            return server.GetPrintQueues()
                .Select(static queue => queue.Name)
                .Where(_allowedPrinterNames.Contains)
                .Order(StringComparer.CurrentCulture)
                .ToArray();
        }
        catch (PrintSystemException)
        {
            return [];
        }
    }

    public PrinterState GetState(string printerName) =>
        _allowedPrinterNames.Contains(printerName)
            ? WindowsPrintEngine.GetPrinterState(printerName)
            : PrinterState.Unknown;
}
#endif
