using System.Buffers.Binary;
using Paradiso.PrintCess.Core.Documents;

namespace Paradiso.PrintCess.Tests.Documents;

public sealed class PrintBundleTests
{
    [Fact]
    public void Parse_PreservesMixedFilesInOrder()
    {
        var bytes = Bundle(
            (DocumentKind.Jpeg, new byte[] { 1, 2, 3 }),
            (DocumentKind.Pdf, new byte[] { 4, 5 }),
            (DocumentKind.Hwpx, new byte[] { 6, 7, 8 }));

        using var bundle = PrintBundle.Parse(bytes);

        Assert.Equal(3, bundle.Entries.Count);
        Assert.Equal(DocumentKind.Jpeg, bundle.Entries[0].Kind);
        Assert.Equal(new byte[] { 1, 2, 3 }, bundle.Entries[0].Bytes);
        Assert.Equal(DocumentKind.Pdf, bundle.Entries[1].Kind);
        Assert.Equal(DocumentKind.Hwpx, bundle.Entries[2].Kind);
    }

    [Fact]
    public void Parse_RejectsTruncatedPayload()
    {
        var bytes = Bundle((DocumentKind.Png, new byte[] { 1, 2, 3 }));
        Assert.Throws<PrintBundleException>(() => PrintBundle.Parse(bytes[..^1]));
    }

    [Fact]
    public void Parse_RejectsNestedBundleKind()
    {
        var bytes = Bundle((DocumentKind.Bundle, new byte[] { 1 }));
        Assert.Throws<PrintBundleException>(() => PrintBundle.Parse(bytes));
    }

    private static byte[] Bundle(params (DocumentKind Kind, byte[] Bytes)[] files)
    {
        var size = 12 + files.Sum(file => 8 + file.Bytes.Length);
        var output = new byte[size];
        new byte[] { 0x50, 0x43, 0x42, 0x4e, 0x44, 0x4c, 0x30, 0x31 }.CopyTo(output, 0);
        output[8] = 1;
        output[9] = checked((byte)files.Length);
        var offset = 12;
        foreach (var file in files)
        {
            output[offset] = (byte)file.Kind;
            BinaryPrimitives.WriteUInt32BigEndian(output.AsSpan(offset + 4, 4), checked((uint)file.Bytes.Length));
            offset += 8;
            file.Bytes.CopyTo(output, offset);
            offset += file.Bytes.Length;
        }
        return output;
    }
}
