using System.IO.Compression;
using System.Text;

namespace Paradiso.PrintCess.Tests.Fixtures;

internal static class HwpxTestDocuments
{
    public static byte[] Valid(bool includeUnsafeScript = false, string mimeType = "application/hwp+zip")
    {
        using var output = new MemoryStream();
        using (var archive = new ZipArchive(output, ZipArchiveMode.Create, leaveOpen: true))
        {
            Write(archive, "mimetype", mimeType, CompressionLevel.NoCompression);
            Write(
                archive,
                "META-INF/container.xml",
                "<?xml version=\"1.0\" encoding=\"UTF-8\"?><container><rootfiles><rootfile full-path=\"Contents/content.hpf\"/></rootfiles></container>");
            Write(archive, "META-INF/manifest.xml", "<?xml version=\"1.0\"?><manifest/>");
            Write(
                archive,
                "Contents/content.hpf",
                "<?xml version=\"1.0\" encoding=\"UTF-8\"?><package><item href=\"header.xml\"/><item href=\"section0.xml\"/></package>");
            Write(archive, "Contents/header.xml", "<?xml version=\"1.0\"?><header/>");
            Write(archive, "Contents/section0.xml", "<?xml version=\"1.0\"?><section><p>synthetic</p></section>");
            if (includeUnsafeScript)
            {
                Write(archive, "Scripts/Default.js", "alert(1)");
            }
        }
        return output.ToArray();
    }

    private static void Write(
        ZipArchive archive,
        string path,
        string value,
        CompressionLevel compression = CompressionLevel.Optimal)
    {
        var entry = archive.CreateEntry(path, compression);
        using var stream = entry.Open();
        var bytes = Encoding.UTF8.GetBytes(value);
        stream.Write(bytes);
    }
}
