namespace Paradiso.PrintCess.Core.Documents;

public enum DocumentKind : byte
{
    Pdf = 1,
    Jpeg = 2,
    Png = 3,
    Hwpx = 4,
}

public static class DocumentKindExtensions
{
    public static string CanonicalMimeType(this DocumentKind kind) => kind switch
    {
        DocumentKind.Pdf => "application/pdf",
        DocumentKind.Jpeg => "image/jpeg",
        DocumentKind.Png => "image/png",
        DocumentKind.Hwpx => "application/hwp+zip",
        _ => throw new ArgumentOutOfRangeException(nameof(kind)),
    };
}
