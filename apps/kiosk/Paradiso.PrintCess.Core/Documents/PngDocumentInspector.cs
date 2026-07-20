using System.Buffers.Binary;

namespace Paradiso.PrintCess.Core.Documents;

internal static class PngDocumentInspector
{
    private static ReadOnlySpan<byte> Magic => [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

    public static DocumentProperties Validate(ReadOnlySpan<byte> content)
    {
        if (content.Length < 45)
        {
            throw Corrupt();
        }

        var offset = Magic.Length;
        var sawHeader = false;
        var sawData = false;
        var sawEnd = false;
        var width = 0;
        var height = 0;
        while (offset < content.Length)
        {
            if (content.Length - offset < 12)
            {
                throw Corrupt();
            }

            var lengthValue = BinaryPrimitives.ReadUInt32BigEndian(content.Slice(offset, 4));
            if (lengthValue > int.MaxValue)
            {
                throw Corrupt();
            }

            var length = (int)lengthValue;
            var chunkTotal = checked(12L + length);
            if (chunkTotal > content.Length - offset)
            {
                throw Corrupt();
            }

            var type = content.Slice(offset + 4, 4);
            var data = content.Slice(offset + 8, length);
            var expectedCrc = BinaryPrimitives.ReadUInt32BigEndian(content.Slice(offset + 8 + length, 4));
            if (Crc32.Compute(content.Slice(offset + 4, 4 + length)) != expectedCrc)
            {
                throw Corrupt();
            }

            if (type.SequenceEqual("IHDR"u8))
            {
                (width, height) = ReadHeader(data, sawHeader, offset);
                sawHeader = true;
            }
            else if (type.SequenceEqual("IDAT"u8))
            {
                if (!sawHeader || sawEnd || length == 0)
                {
                    throw Corrupt();
                }

                sawData = true;
            }
            else if (type.SequenceEqual("IEND"u8))
            {
                if (!sawHeader || !sawData || length != 0)
                {
                    throw Corrupt();
                }

                sawEnd = true;
                offset += checked((int)chunkTotal);
                break;
            }

            offset += checked((int)chunkTotal);
        }

        if (!sawEnd || offset != content.Length)
        {
            throw Corrupt();
        }

        return new DocumentProperties(null, width, height);
    }

    private static (int Width, int Height) ReadHeader(ReadOnlySpan<byte> data, bool sawHeader, int offset)
    {
        if (sawHeader || offset != Magic.Length || data.Length != 13)
        {
            throw Corrupt();
        }

        var widthValue = BinaryPrimitives.ReadUInt32BigEndian(data[..4]);
        var heightValue = BinaryPrimitives.ReadUInt32BigEndian(data[4..8]);
        if (widthValue > int.MaxValue || heightValue > int.MaxValue)
        {
            throw new DocumentValidationException(DocumentValidationError.ImageDimensionsTooLarge);
        }

        var width = (int)widthValue;
        var height = (int)heightValue;
        if (!ValidColor(data[8], data[9]) || data[10] != 0 || data[11] != 0 || data[12] > 1)
        {
            throw Corrupt();
        }

        ImageValidationLimits.ValidateDimensions(width, height);
        return (width, height);
    }

    private static bool ValidColor(byte bitDepth, byte colorType) => colorType switch
    {
        0 => bitDepth is 1 or 2 or 4 or 8 or 16,
        2 => bitDepth is 8 or 16,
        3 => bitDepth is 1 or 2 or 4 or 8,
        4 => bitDepth is 8 or 16,
        6 => bitDepth is 8 or 16,
        _ => false,
    };

    private static DocumentValidationException Corrupt() =>
        new(DocumentValidationError.CorruptImage);

    private static class Crc32
    {
        public static uint Compute(ReadOnlySpan<byte> input)
        {
            var crc = uint.MaxValue;
            foreach (var value in input)
            {
                crc ^= value;
                for (var bit = 0; bit < 8; bit++)
                {
                    var mask = (uint)-(int)(crc & 1);
                    crc = (crc >> 1) ^ (0xedb88320U & mask);
                }
            }

            return ~crc;
        }
    }
}
