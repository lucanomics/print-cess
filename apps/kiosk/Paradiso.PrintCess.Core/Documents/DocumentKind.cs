namespace Paradiso.PrintCess.Core.Documents;

public enum DocumentKind : byte
{
    Pdf = 1,
    Jpeg = 2,
    Png = 3,
    Hwpx = 4,
    Hwp = 5,
}

public static class DocumentKindExtensions
{
    public static string CanonicalMimeType(this DocumentKind kind) => kind switch
    {
        DocumentKind.Pdf => "application/pdf",
        DocumentKind.Jpeg => "image/jpeg",
        DocumentKind.Png => "image/png",
        DocumentKind.Hwpx => "application/hwp+zip",
        DocumentKind.Hwp => "application/x-hwp",
        _ => throw new ArgumentOutOfRangeException(nameof(kind)),
    };
}
