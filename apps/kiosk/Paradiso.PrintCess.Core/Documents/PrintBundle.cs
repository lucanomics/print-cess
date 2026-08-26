using Paradiso.PrintCess.Core.Protocol;

namespace Paradiso.PrintCess.Core.Documents;

// Bundle parsing lives in Core.Protocol.PrintBundle. Keep only the local magic
// probe here so DocumentValidation can classify a bundle without introducing a
// second parser with a different file-count or payload limit.
internal static class PrintBundle
{
    private static ReadOnlySpan<byte> Magic => [0x50, 0x43, 0x42, 0x4e, 0x44, 0x4c, 0x30, 0x31];

    public static bool LooksLike(ReadOnlySpan<byte> bytes) =>
        bytes.Length >= Magic.Length && bytes[..Magic.Length].SequenceEqual(Magic);
}

// Retained for the PR's visitor-facing error mapping. The canonical protocol
// parser currently throws EnvelopeFormatException, which is handled by the same
// failure path.
public sealed class PrintBundleException : ProtocolException
{
    public PrintBundleException(string message)
        : base(message)
    {
    }
}
