using System.Security.Cryptography;
using Paradiso.PrintCess.Core.Protocol;

namespace Paradiso.PrintCess.Core.Documents;

public interface IDocumentValidator
{
    ValidatedDocument Validate(
        ReadOnlySpan<byte> content,
        DocumentKind expectedKind,
        string? declaredMimeType,
        string idempotencyKey);
}

public sealed class ValidatedDocument : IDisposable
{
    private bool _disposed;

    internal ValidatedDocument(
        DocumentKind kind,
        byte[] content,
        string idempotencyKey,
        DocumentProperties properties)
    {
        Kind = kind;
        Content = content;
        IdempotencyKey = idempotencyKey;
        Properties = properties;
        ContentSha256 = SHA256.HashData(content);
    }

    public DocumentKind Kind { get; }

    public byte[] Content { get; }

    public string IdempotencyKey { get; }

    public DocumentProperties Properties { get; }

    public byte[] ContentSha256 { get; }

    public void Dispose()
    {
        if (_disposed)
        {
            return;
        }

        _disposed = true;
        CryptographicOperations.ZeroMemory(Content);
        CryptographicOperations.ZeroMemory(ContentSha256);
    }
}

public sealed record DocumentProperties(int? PageCount, int? PixelWidth, int? PixelHeight);

public enum DocumentValidationError
{
    Empty,
    TooLarge,
    TypeMismatch,
    MimeMismatch,
    CorruptPdf,
    LockedPdf,
    TooManyPages,
    ActivePdfContent,
    CorruptImage,
    ImageDimensionsTooLarge,
}

public sealed class DocumentValidationException : Exception
{
    public DocumentValidationException(DocumentValidationError error)
        : base(MessageFor(error))
    {
        Error = error;
    }

    public DocumentValidationError Error { get; }

    private static string MessageFor(DocumentValidationError error) => error switch
    {
        DocumentValidationError.Empty => "The document is empty.",
        DocumentValidationError.TooLarge => "The document exceeds the 10 MiB limit.",
        DocumentValidationError.TypeMismatch => "The document content does not match its expected type.",
        DocumentValidationError.MimeMismatch => "The declared media type does not match the document.",
        DocumentValidationError.CorruptPdf => "The PDF structure is invalid.",
        DocumentValidationError.LockedPdf => "The PDF is encrypted or password protected.",
        DocumentValidationError.TooManyPages => "The PDF contains more than 10 pages.",
        DocumentValidationError.ActivePdfContent => "The PDF contains unsupported active or external content.",
        DocumentValidationError.CorruptImage => "The image structure is invalid.",
        DocumentValidationError.ImageDimensionsTooLarge => "The image dimensions exceed the safe limit.",
        _ => "The document is invalid.",
    };
}

public sealed class PortableDocumentValidator : IDocumentValidator
{
    public const int MaximumPdfPages = 10;
    public const int MaximumImageDimension = 20_000;
    public const long MaximumImagePixels = 40_000_000;

    private static ReadOnlySpan<byte> PdfMagic => "%PDF-"u8;
    private static ReadOnlySpan<byte> PngMagic => [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

    public ValidatedDocument Validate(
        ReadOnlySpan<byte> content,
        DocumentKind expectedKind,
        string? declaredMimeType,
        string idempotencyKey)
    {
        CanonicalEncoding.ValidateSessionId(idempotencyKey);
        if (content.IsEmpty)
        {
            throw new DocumentValidationException(DocumentValidationError.Empty);
        }

        if (content.Length > BinaryEnvelope.MaxPlaintextBytes)
        {
            throw new DocumentValidationException(DocumentValidationError.TooLarge);
        }

        var detectedKind = DetectKind(content);
        if (detectedKind != expectedKind)
        {
            throw new DocumentValidationException(DocumentValidationError.TypeMismatch);
        }

        if (declaredMimeType is not null &&
            !string.Equals(declaredMimeType.Trim(), detectedKind.CanonicalMimeType(), StringComparison.OrdinalIgnoreCase))
        {
            throw new DocumentValidationException(DocumentValidationError.MimeMismatch);
        }

        var properties = detectedKind switch
        {
            DocumentKind.Pdf => PdfDocumentInspector.Validate(content),
            DocumentKind.Png => PngDocumentInspector.Validate(content),
            DocumentKind.Jpeg => JpegDocumentInspector.Validate(content),
            _ => throw new DocumentValidationException(DocumentValidationError.TypeMismatch),
        };

        return new ValidatedDocument(detectedKind, content.ToArray(), idempotencyKey, properties);
    }

    public static DocumentKind DetectKind(ReadOnlySpan<byte> content)
    {
        if (content.StartsWith(PdfMagic))
        {
            return DocumentKind.Pdf;
        }

        if (content.StartsWith(PngMagic))
        {
            return DocumentKind.Png;
        }

        if (content.Length >= 3 && content[0] == 0xff && content[1] == 0xd8 && content[2] == 0xff)
        {
            return DocumentKind.Jpeg;
        }

        throw new DocumentValidationException(DocumentValidationError.TypeMismatch);
    }
}
