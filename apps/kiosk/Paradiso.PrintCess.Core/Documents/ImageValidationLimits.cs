namespace Paradiso.PrintCess.Core.Documents;

internal static class ImageValidationLimits
{
    public static void ValidateDimensions(int width, int height)
    {
        if (width <= 0 || height <= 0 ||
            width > PortableDocumentValidator.MaximumImageDimension ||
            height > PortableDocumentValidator.MaximumImageDimension ||
            (long)width * height > PortableDocumentValidator.MaximumImagePixels)
        {
            throw new DocumentValidationException(DocumentValidationError.ImageDimensionsTooLarge);
        }
    }
}
