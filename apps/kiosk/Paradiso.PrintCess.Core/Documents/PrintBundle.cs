using System.Buffers.Binary;
using System.Security.Cryptography;
using Paradiso.PrintCess.Core.Protocol;

namespace Paradiso.PrintCess.Core.Documents;

public sealed class PrintBundle : IDisposable
{
    public const int MaximumFiles = 20;
    private const int HeaderBytes = 12;
    private const int EntryHeaderBytes = 8;
    private static ReadOnlySpan<byte> Magic => [0x50, 0x43, 0x42, 0x4e, 0x44, 0x4c, 0x30, 0x31];
    private bool _disposed;

    private PrintBundle(IReadOnlyList<PrintBundleEntry> entries)
    {
        Entries = entries;
    }

    public IReadOnlyList<PrintBundleEntry> Entries { get; }

    public static PrintBundle Parse(ReadOnlySpan<byte> bytes)
    {
        if (bytes.Length is < HeaderBytes or > BinaryEnvelope.MaxPlaintextBytes ||
            !bytes[..Magic.Length].SequenceEqual(Magic))
        {
            throw new PrintBundleException("Print bundle header is invalid.");
        }

        if (bytes[8] != 1 || bytes[9] is < 1 or > MaximumFiles ||
            BinaryPrimitives.ReadUInt16BigEndian(bytes[10..12]) != 0)
        {
            throw new PrintBundleException("Print bundle metadata is invalid.");
        }

        var count = bytes[9];
        var entries = new List<PrintBundleEntry>(count);
        var offset = HeaderBytes;
        try
        {
            for (var index = 0; index < count; index++)
            {
                if (offset + EntryHeaderBytes > bytes.Length)
                {
                    throw new PrintBundleException("Print bundle entry header is truncated.");
                }

                var kind = bytes[offset] switch
                {
                    (byte)DocumentKind.Pdf => DocumentKind.Pdf,
                    (byte)DocumentKind.Jpeg => DocumentKind.Jpeg,
                    (byte)DocumentKind.Png => DocumentKind.Png,
                    (byte)DocumentKind.Hwpx => DocumentKind.Hwpx,
                    (byte)DocumentKind.Hwp => DocumentKind.Hwp,
                    _ => throw new PrintBundleException("Print bundle entry type is unsupported."),
                };
                if (bytes[offset + 1] != 0 || BinaryPrimitives.ReadUInt16BigEndian(bytes.Slice(offset + 2, 2)) != 0)
                {
                    throw new PrintBundleException("Print bundle entry flags are unsupported.");
                }

                var length = BinaryPrimitives.ReadUInt32BigEndian(bytes.Slice(offset + 4, 4));
                offset += EntryHeaderBytes;
                if (length is 0 or > BinaryEnvelope.MaxPlaintextBytes ||
                    (ulong)offset + length > (ulong)bytes.Length)
                {
                    throw new PrintBundleException("Print bundle entry length is invalid.");
                }

                entries.Add(new PrintBundleEntry(kind, bytes.Slice(offset, checked((int)length)).ToArray()));
                offset += checked((int)length);
            }

            if (offset != bytes.Length)
            {
                throw new PrintBundleException("Print bundle has trailing bytes.");
            }

            return new PrintBundle(entries);
        }
        catch
        {
            foreach (var entry in entries)
            {
                entry.Dispose();
            }
            throw;
        }
    }

    public void Dispose()
    {
        if (_disposed)
        {
            return;
        }

        _disposed = true;
        foreach (var entry in Entries)
        {
            entry.Dispose();
        }
    }
}

public sealed class PrintBundleEntry : IDisposable
{
    private bool _disposed;

    internal PrintBundleEntry(DocumentKind kind, byte[] bytes)
    {
        Kind = kind;
        Bytes = bytes;
    }

    public DocumentKind Kind { get; }

    public byte[] Bytes { get; }

    public void Dispose()
    {
        if (_disposed)
        {
            return;
        }

        _disposed = true;
        CryptographicOperations.ZeroMemory(Bytes);
    }
}

public sealed class PrintBundleException : ProtocolException
{
    public PrintBundleException(string message)
        : base(message)
    {
    }
}
