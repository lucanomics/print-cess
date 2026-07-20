using System.Globalization;
using System.IO;
using System.Windows;
using System.Windows.Media;
using System.Windows.Media.Imaging;

namespace Paradiso.PrintCess.Kiosk;

internal static class AdminTestPageFactory
{
    private const int Width = 1_240;
    private const int Height = 1_754;

    public static byte[] CreatePng(string printerName, DateTimeOffset createdAt)
    {
        var visual = new DrawingVisual();
        using (var drawing = visual.RenderOpen())
        {
            drawing.DrawRectangle(Brushes.White, null, new Rect(0, 0, Width, Height));
            drawing.DrawRectangle(new SolidColorBrush(Color.FromRgb(0, 108, 102)), null, new Rect(0, 0, Width, 150));
            DrawText(drawing, "Print-cess by Paradiso", 54, Brushes.White, 74, 38, FontWeights.SemiBold);
            DrawText(drawing, "프린터 테스트 페이지", 66, Brushes.Black, 90, 245, FontWeights.Bold);
            DrawText(drawing, "이 페이지는 관리자 진단 화면에서 생성되었습니다.", 34, Brushes.DimGray, 90, 350, FontWeights.Normal);

            DrawLabelValue(drawing, "프린터", printerName, 90, 500);
            DrawLabelValue(drawing, "용지", "A4", 90, 610);
            DrawLabelValue(drawing, "설정", "한 부 · 단면 · 흑백 · 페이지 맞춤", 90, 720);
            DrawLabelValue(drawing, "생성 시각", createdAt.ToLocalTime().ToString("yyyy-MM-dd HH:mm:ss zzz", CultureInfo.InvariantCulture), 90, 830);

            drawing.DrawRectangle(Brushes.Black, null, new Rect(90, 1_020, 212, 150));
            drawing.DrawRectangle(Brushes.DimGray, null, new Rect(302, 1_020, 212, 150));
            drawing.DrawRectangle(Brushes.Gray, null, new Rect(514, 1_020, 212, 150));
            drawing.DrawRectangle(Brushes.LightGray, null, new Rect(726, 1_020, 212, 150));
            drawing.DrawRectangle(Brushes.White, new Pen(Brushes.Black, 2), new Rect(938, 1_020, 212, 150));
            DrawText(drawing, "흑백 단계와 여백이 모두 보이면 테스트가 정상입니다.", 32, Brushes.Black, 90, 1_250, FontWeights.SemiBold);
            DrawText(drawing, "실제 출력 완료 여부는 프린터 출력구에서 확인하세요.", 30, Brushes.DimGray, 90, 1_330, FontWeights.Normal);
        }

        var bitmap = new RenderTargetBitmap(Width, Height, 150, 150, PixelFormats.Pbgra32);
        bitmap.Render(visual);
        bitmap.Freeze();
        var encoder = new PngBitmapEncoder();
        encoder.Frames.Add(BitmapFrame.Create(bitmap));
        using var stream = new MemoryStream();
        encoder.Save(stream);
        return stream.ToArray();
    }

    private static void DrawLabelValue(DrawingContext drawing, string label, string value, double x, double y)
    {
        DrawText(drawing, label, 28, Brushes.DimGray, x, y, FontWeights.SemiBold);
        DrawText(drawing, value, 36, Brushes.Black, x + 190, y - 5, FontWeights.Normal);
    }

    private static void DrawText(
        DrawingContext drawing,
        string text,
        double size,
        Brush brush,
        double x,
        double y,
        FontWeight weight)
    {
        var formatted = new FormattedText(
            text,
            CultureInfo.GetCultureInfo("ko-KR"),
            FlowDirection.LeftToRight,
            new Typeface(new FontFamily("Segoe UI, Malgun Gothic"), FontStyles.Normal, weight, FontStretches.Normal),
            size,
            brush,
            1.0);
        drawing.DrawText(formatted, new Point(x, y));
    }
}
