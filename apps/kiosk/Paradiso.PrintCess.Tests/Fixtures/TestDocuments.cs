using System.Security.Cryptography;
using System.Text;
using Paradiso.PrintCess.Core.Protocol;

namespace Paradiso.PrintCess.Tests.Fixtures;

internal static class TestDocuments
{
    public const string SessionId = "AAECAwQFBgcICQoLDA0ODw";

    public static byte[] OnePagePdf(string extraCatalog = "") => Encoding.ASCII.GetBytes($$"""
        %PDF-1.4
        1 0 obj
        << /Type /Catalog /Pages 2 0 R {{extraCatalog}} >>
        endobj
        2 0 obj
        << /Type /Pages /Count 1 /Kids [3 0 R] >>
        endobj
        3 0 obj
        << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] >>
        endobj
        trailer
        << /Root 1 0 R >>
        %%EOF
        """);

    public static byte[] PdfWithPages(int count)
    {
        var builder = new StringBuilder("%PDF-1.4\n1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n");
        builder.Append("2 0 obj << /Type /Pages /Count ").Append(count).Append(" /Kids [");
        for (var index = 0; index < count; index++)
        {
            builder.Append(index + 3).Append(" 0 R ");
        }

        builder.Append("] >> endobj\n");
        for (var index = 0; index < count; index++)
        {
            builder.Append(index + 3).Append(" 0 obj << /Type /Page /Parent 2 0 R >> endobj\n");
        }

        builder.Append("trailer << /Root 1 0 R >>\n%%EOF\n");
        return Encoding.ASCII.GetBytes(builder.ToString());
    }

    public static byte[] OnePixelPng() => Convert.FromBase64String(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=");

    public static byte[] StructuralJpeg() =>
    [
        0xff, 0xd8,
        0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01, 0x00, 0x01, 0x01, 0x01, 0x11, 0x00,
        0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00,
        0x00, 0xff, 0xd9,
    ];

    public static string Fingerprint(ReadOnlySpan<byte> publicKey) =>
        CanonicalEncoding.EncodeBase64Url(SHA256.HashData(publicKey));
}
