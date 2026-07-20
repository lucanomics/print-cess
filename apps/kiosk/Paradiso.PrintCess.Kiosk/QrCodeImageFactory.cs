using System.IO;
using System.Security.Cryptography;
using System.Windows.Media.Imaging;
using QRCoder;

namespace Paradiso.PrintCess.Kiosk;

internal static class QrCodeImageFactory
{
    public static BitmapSource Create(string payload)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(payload);
        var png = PngByteQRCodeHelper.GetQRCode(payload, QRCodeGenerator.ECCLevel.M, 12, true);
        try
        {
            using var stream = new MemoryStream(png, writable: false);
            var image = new BitmapImage();
            image.BeginInit();
            image.CacheOption = BitmapCacheOption.OnLoad;
            image.StreamSource = stream;
            image.EndInit();
            image.Freeze();
            return image;
        }
        finally
        {
            CryptographicOperations.ZeroMemory(png);
        }
    }
}
