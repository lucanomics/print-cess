using Paradiso.PrintCess.Core.Protocol;

namespace Paradiso.PrintCess.Core.Documents;

internal static class PrintBundleDocumentInspector
{
    public static DocumentProperties Validate(ReadOnlySpan<byte> content)
    {
        try
        {
            using var bundle = PrintBundle.Parse(content);
            foreach (var entry in bundle.Entries)
            {
                _ = entry.Kind switch
                {
                    DocumentKind.Pdf => PdfDocumentInspector.Validate(entry.Bytes),
                    DocumentKind.Png => PngDocumentInspector.Validate(entry.Bytes),
                    DocumentKind.Jpeg => JpegDocumentInspector.Validate(entry.Bytes),
                    DocumentKind.Hwpx => HwpxDocumentInspector.Validate(entry.Bytes),
                    DocumentKind.Hwp => HwpDocumentInspector.Validate(entry.Bytes),
                    _ => throw new DocumentValidationException(DocumentValidationError.CorruptBundle),
                };
            }
            return new DocumentProperties(null, null, null);
        }
        catch (DocumentValidationException)
        {
            throw;
        }
        catch (ProtocolException)
        {
            throw new DocumentValidationException(DocumentValidationError.CorruptBundle);
        }
    }
}
