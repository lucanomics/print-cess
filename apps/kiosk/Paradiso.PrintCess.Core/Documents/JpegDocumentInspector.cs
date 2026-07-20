using System.Buffers.Binary;

namespace Paradiso.PrintCess.Core.Documents;

internal static class JpegDocumentInspector
{
    public static DocumentProperties Validate(ReadOnlySpan<byte> content)
    {
        if (content.Length < 12 || content[^2] != 0xff || content[^1] != 0xd9)
        {
            throw Corrupt();
        }

        var offset = 2;
        var sawStartOfFrame = false;
        var sawScan = false;
        var width = 0;
        var height = 0;
        while (offset < content.Length - 2)
        {
            if (content[offset++] != 0xff)
            {
                throw Corrupt();
            }

            while (offset < content.Length && content[offset] == 0xff)
            {
                offset++;
            }

            if (offset >= content.Length)
            {
                throw Corrupt();
            }

            var marker = content[offset++];
            if (marker == 0xda)
            {
                sawScan = true;
                break;
            }

            if (marker is 0x01 or >= 0xd0 and <= 0xd9)
            {
                continue;
            }

            if (content.Length - offset < 2)
            {
                throw Corrupt();
            }

            var segmentLength = BinaryPrimitives.ReadUInt16BigEndian(content.Slice(offset, 2));
            if (segmentLength < 2 || segmentLength > content.Length - offset)
            {
                throw Corrupt();
            }

            if (IsStartOfFrame(marker))
            {
                if (segmentLength < 8 || sawStartOfFrame)
                {
                    throw Corrupt();
                }

                sawStartOfFrame = true;
                height = BinaryPrimitives.ReadUInt16BigEndian(content.Slice(offset + 3, 2));
                width = BinaryPrimitives.ReadUInt16BigEndian(content.Slice(offset + 5, 2));
                ImageValidationLimits.ValidateDimensions(width, height);
            }

            offset += segmentLength;
        }

        if (!sawStartOfFrame || !sawScan)
        {
            throw Corrupt();
        }

        return new DocumentProperties(null, width, height);
    }

    private static bool IsStartOfFrame(byte marker) =>
        marker is >= 0xc0 and <= 0xcf and not (0xc4 or 0xc8 or 0xcc);

    private static DocumentValidationException Corrupt() =>
        new(DocumentValidationError.CorruptImage);
}
