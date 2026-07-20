using Paradiso.PrintCess.Core.Printing;
using Paradiso.PrintCess.Infrastructure.Printing;

namespace Paradiso.PrintCess.Tests.Printing;

public sealed class PrinterSelectionTests : IDisposable
{
    private readonly string _temporaryDirectory = Path.Combine(
        Path.GetTempPath(),
        $"printcess-printer-selection-{Guid.NewGuid():N}");

    [Fact]
    public void PersistsAndAtomicallyReplacesSelection()
    {
        var path = Path.Combine(_temporaryDirectory, "printer-selection.json");
        var store = new FilePrinterSelectionStore(path);

        store.Save("Paradiso 승인 프린터 A");
        Assert.Equal("Paradiso 승인 프린터 A", store.Load());

        store.Save("Paradiso 승인 프린터 B");
        Assert.Equal("Paradiso 승인 프린터 B", new FilePrinterSelectionStore(path).Load());
        Assert.Single(Directory.GetFiles(_temporaryDirectory));
    }

    [Fact]
    public async Task CorruptOrExtendedSelectionFailsClosed()
    {
        var path = Path.Combine(_temporaryDirectory, "printer-selection.json");
        Directory.CreateDirectory(_temporaryDirectory);
        await File.WriteAllTextAsync(path, "{\"version\":1,\"printerName\":\"approved\",\"unexpected\":true}");
        var store = new FilePrinterSelectionStore(path);

        Assert.Null(store.Load());

        await File.WriteAllTextAsync(path, "not-json");
        Assert.Null(store.Load());
    }

    [Theory]
    [InlineData("")]
    [InlineData("bad\nprinter")]
    public void RejectsInvalidPrinterName(string printerName)
    {
        var store = new FilePrinterSelectionStore(Path.Combine(_temporaryDirectory, "printer-selection.json"));

        Assert.Throws<ArgumentException>(() => store.Save(printerName));
    }

    [Fact]
    public void FixedCatalogReturnsStateOnlyForExactApprovedName()
    {
        var catalog = new FixedPrinterCatalog("Approved Queue", PrinterState.Ready);

        Assert.Equal(["Approved Queue"], catalog.GetAvailablePrinterNames());
        Assert.Equal(PrinterState.Ready, catalog.GetState("Approved Queue"));
        Assert.Equal(PrinterState.Unknown, catalog.GetState("approved queue"));
    }

    public void Dispose()
    {
        if (Directory.Exists(_temporaryDirectory))
        {
            Directory.Delete(_temporaryDirectory, recursive: true);
        }
    }
}
