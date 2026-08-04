#if WINDOWS
using System.Reflection;
using System.Runtime.InteropServices;

namespace Paradiso.PrintCess.Infrastructure.Printing;

internal static class HancomHwpxRenderer
{
    private const int MaximumRenderedPdfBytes = 64 * 1024 * 1024;
    private const string SecurityModuleEnvironmentVariable = "PRINT_CESS_HANCOM_SECURITY_MODULE";

    public static Task<byte[]> RenderToPdfAsync(byte[] content, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(content);
        cancellationToken.ThrowIfCancellationRequested();

        var moduleName = Environment.GetEnvironmentVariable(SecurityModuleEnvironmentVariable)?.Trim();
        if (string.IsNullOrWhiteSpace(moduleName))
        {
            throw new InvalidDataException(
                $"{SecurityModuleEnvironmentVariable} must name an installed Hancom file-path security module.");
        }

        var directory = Path.Combine(Path.GetTempPath(), "PrintCess", Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(directory);
        var inputPath = Path.Combine(directory, "document.hwpx");
        var outputPath = Path.Combine(directory, "document.pdf");
        object? automation = null;

        try
        {
            cancellationToken.ThrowIfCancellationRequested();
            File.WriteAllBytes(inputPath, content);

            var automationType = Type.GetTypeFromProgID("HWPFrame.HwpObject.2", throwOnError: false) ??
                                 Type.GetTypeFromProgID("HWPFrame.HwpObject", throwOnError: false);
            if (automationType is null)
            {
                throw new InvalidDataException("A supported Hancom Office automation component is not installed.");
            }

            automation = Activator.CreateInstance(automationType) ??
                         throw new InvalidDataException("Hancom Office automation could not be started.");

            var registered = Invoke(automation, "RegisterModule", "FilePathCheckDLL", moduleName);
            if (registered is not bool registeredResult || !registeredResult)
            {
                throw new InvalidDataException("The configured Hancom security module could not be registered.");
            }

            cancellationToken.ThrowIfCancellationRequested();
            var opened = Invoke(automation, "Open", inputPath, "HWPX", "forceopen:true");
            if (opened is bool openedResult && !openedResult)
            {
                throw new InvalidDataException("Hancom Office rejected the HWPX document.");
            }

            cancellationToken.ThrowIfCancellationRequested();
            var saved = Invoke(automation, "SaveAs", outputPath, "PDF", string.Empty);
            if (saved is bool savedResult && !savedResult)
            {
                throw new InvalidDataException("Hancom Office could not render the HWPX document as PDF.");
            }

            if (!File.Exists(outputPath))
            {
                throw new InvalidDataException("Hancom Office did not create a PDF output file.");
            }

            var info = new FileInfo(outputPath);
            if (info.Length is < 1 or > MaximumRenderedPdfBytes)
            {
                throw new InvalidDataException("The rendered PDF is outside the safe size limit.");
            }

            cancellationToken.ThrowIfCancellationRequested();
            return Task.FromResult(File.ReadAllBytes(outputPath));
        }
        catch (Exception exception) when (exception is COMException or TargetInvocationException or
                                          MissingMethodException or UnauthorizedAccessException or IOException)
        {
            throw new InvalidDataException("HWPX rendering failed safely.", exception);
        }
        finally
        {
            if (automation is not null)
            {
                TryInvoke(automation, "Clear", 1);
                TryInvoke(automation, "Quit");
                if (Marshal.IsComObject(automation))
                {
                    Marshal.FinalReleaseComObject(automation);
                }
            }

            SecureDelete(inputPath);
            SecureDelete(outputPath);
            try
            {
                if (Directory.Exists(directory))
                {
                    Directory.Delete(directory, recursive: true);
                }
            }
            catch
            {
                // The application-owned cleanup job retries abandoned temporary directories.
            }
        }
    }

    private static object? Invoke(object target, string method, params object?[] arguments) =>
        target.GetType().InvokeMember(
            method,
            BindingFlags.InvokeMethod | BindingFlags.Public | BindingFlags.Instance,
            binder: null,
            target,
            arguments);

    private static void TryInvoke(object target, string method, params object?[] arguments)
    {
        try
        {
            Invoke(target, method, arguments);
        }
        catch
        {
            // Cleanup must continue even when the automation object is already shutting down.
        }
    }

    private static void SecureDelete(string path)
    {
        try
        {
            if (!File.Exists(path))
            {
                return;
            }

            var length = new FileInfo(path).Length;
            if (length is > 0 and <= MaximumRenderedPdfBytes)
            {
                using var stream = new FileStream(path, FileMode.Open, FileAccess.Write, FileShare.None);
                var zeros = new byte[64 * 1024];
                long remaining = length;
                while (remaining > 0)
                {
                    var count = (int)Math.Min(zeros.Length, remaining);
                    stream.Write(zeros, 0, count);
                    remaining -= count;
                }
                stream.Flush(flushToDisk: true);
            }
            File.Delete(path);
        }
        catch
        {
            // Best effort only; encrypted transfer storage remains independently short-lived.
        }
    }
}
#endif
