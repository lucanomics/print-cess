namespace Paradiso.PrintCess.Core.Documents;

internal static class PdfDocumentInspector
{
    private static readonly byte[][] ProhibitedTokens =
    [
        "/JavaScript"u8.ToArray(),
        "/JS"u8.ToArray(),
        "/OpenAction"u8.ToArray(),
        "/Launch"u8.ToArray(),
        "/EmbeddedFile"u8.ToArray(),
        "/Filespec"u8.ToArray(),
        "/AA"u8.ToArray(),
        "/URI"u8.ToArray(),
    ];

    public static DocumentProperties Validate(ReadOnlySpan<byte> content)
    {
        if (content.Length < 16 || content[5] is not (>= (byte)'1' and <= (byte)'2') || content[6] != (byte)'.')
        {
            throw new DocumentValidationException(DocumentValidationError.CorruptPdf);
        }

        var trailerWindow = content[^Math.Min(content.Length, 2_048)..];
        if (trailerWindow.LastIndexOf("%%EOF"u8) < 0)
        {
            throw new DocumentValidationException(DocumentValidationError.CorruptPdf);
        }

        if (ContainsToken(content, "/Encrypt"u8))
        {
            throw new DocumentValidationException(DocumentValidationError.LockedPdf);
        }

        foreach (var token in ProhibitedTokens)
        {
            if (ContainsToken(content, token))
            {
                throw new DocumentValidationException(DocumentValidationError.ActivePdfContent);
            }
        }

        var pages = CountPages(content);
        if (pages < 1)
        {
            throw new DocumentValidationException(DocumentValidationError.CorruptPdf);
        }

        if (pages > PortableDocumentValidator.MaximumPdfPages)
        {
            throw new DocumentValidationException(DocumentValidationError.TooManyPages);
        }

        return new DocumentProperties(pages, null, null);
    }

    private static int CountPages(ReadOnlySpan<byte> content)
    {
        var count = 0;
        var offset = 0;
        while ((offset = content[offset..].IndexOf("/Type"u8)) >= 0)
        {
            var absolute = offset;
            while (absolute < content.Length && !IsWhitespace(content[absolute]))
            {
                absolute++;
            }

            while (absolute < content.Length && IsWhitespace(content[absolute]))
            {
                absolute++;
            }

            if (absolute + 5 <= content.Length && content.Slice(absolute, 5).SequenceEqual("/Page"u8) &&
                (absolute + 5 == content.Length || IsDelimiter(content[absolute + 5])))
            {
                count++;
            }

            content = content[(offset + 5)..];
            offset = 0;
        }

        return count;
    }

    private static bool ContainsToken(ReadOnlySpan<byte> content, ReadOnlySpan<byte> token)
    {
        var offset = 0;
        while ((offset = content.IndexOf(token)) >= 0)
        {
            var after = offset + token.Length;
            if (after == content.Length || IsDelimiter(content[after]))
            {
                return true;
            }

            content = content[(offset + token.Length)..];
        }

        return false;
    }

    private static bool IsWhitespace(byte value) => value is 0 or 9 or 10 or 12 or 13 or 32;

    private static bool IsDelimiter(byte value) =>
        IsWhitespace(value) || value is (byte)'/' or (byte)'<' or (byte)'>' or (byte)'[' or (byte)']' or (byte)'(' or (byte)')';
}
