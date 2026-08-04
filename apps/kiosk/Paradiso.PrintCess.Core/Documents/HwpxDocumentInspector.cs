using System.Buffers.Binary;
using System.IO.Compression;
using System.Text;
using System.Xml;

namespace Paradiso.PrintCess.Core.Documents;

internal static class HwpxDocumentInspector
{
    private const string MimeType = "application/hwp+zip";
    private const int MaximumEntries = 512;
    private const long MaximumExpandedBytes = 64L * 1024 * 1024;
    private const long MaximumEntryBytes = 32L * 1024 * 1024;
    private const double MaximumCompressionRatio = 250;

    private static readonly HashSet<string> BlockedEmbeddedExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ".bat", ".cmd", ".com", ".dll", ".exe", ".html", ".js", ".lnk", ".msi",
        ".ole", ".ps1", ".scr", ".svg", ".vbs", ".wsf", ".zip",
    };

    public static bool LooksLikeHwpx(ReadOnlySpan<byte> content)
    {
        if (content.Length < 38 || BinaryPrimitives.ReadUInt32LittleEndian(content[..4]) != 0x04034b50)
        {
            return false;
        }

        var flags = BinaryPrimitives.ReadUInt16LittleEndian(content.Slice(6, 2));
        var method = BinaryPrimitives.ReadUInt16LittleEndian(content.Slice(8, 2));
        var nameLength = BinaryPrimitives.ReadUInt16LittleEndian(content.Slice(26, 2));
        var extraLength = BinaryPrimitives.ReadUInt16LittleEndian(content.Slice(28, 2));
        if ((flags & 1) != 0 || method != 0 || 30 + nameLength + extraLength > content.Length)
        {
            return false;
        }

        return Encoding.UTF8.GetString(content.Slice(30, nameLength)) == "mimetype";
    }

    public static DocumentProperties Validate(ReadOnlySpan<byte> content)
    {
        if (!LooksLikeHwpx(content))
        {
            throw new DocumentValidationException(DocumentValidationError.CorruptHwpx);
        }

        using var stream = new MemoryStream(content.ToArray(), writable: false);
        using var archive = new ZipArchive(stream, ZipArchiveMode.Read, leaveOpen: false);
        if (archive.Entries.Count is < 5 or > MaximumEntries)
        {
            throw new DocumentValidationException(DocumentValidationError.CorruptHwpx);
        }

        var entries = new Dictionary<string, ZipArchiveEntry>(StringComparer.Ordinal);
        long expandedBytes = 0;
        foreach (var entry in archive.Entries)
        {
            var name = ValidateEntryName(entry.FullName);
            if (!entries.TryAdd(name, entry))
            {
                throw new DocumentValidationException(DocumentValidationError.CorruptHwpx);
            }

            if (entry.Length < 0 || entry.Length > MaximumEntryBytes)
            {
                throw new DocumentValidationException(DocumentValidationError.CorruptHwpx);
            }

            expandedBytes = checked(expandedBytes + entry.Length);
            if (expandedBytes > MaximumExpandedBytes ||
                (entry.CompressedLength > 0 && entry.Length > 1024 * 1024 &&
                 (double)entry.Length / entry.CompressedLength > MaximumCompressionRatio))
            {
                throw new DocumentValidationException(DocumentValidationError.CorruptHwpx);
            }

            RejectActiveEntry(name);
        }

        Require(entries, "mimetype");
        Require(entries, "META-INF/container.xml");
        Require(entries, "Contents/content.hpf");
        Require(entries, "Contents/header.xml");

        using (var reader = new StreamReader(entries["mimetype"].Open(), Encoding.UTF8, true, 128, false))
        {
            if (!string.Equals(reader.ReadToEnd().TrimStart('\uFEFF').Trim(), MimeType, StringComparison.Ordinal))
            {
                throw new DocumentValidationException(DocumentValidationError.CorruptHwpx);
            }
        }

        var sectionNames = entries.Keys
            .Where(static name => name.StartsWith("Contents/section", StringComparison.Ordinal) &&
                                  name.EndsWith(".xml", StringComparison.Ordinal))
            .ToArray();
        if (sectionNames.Length == 0)
        {
            throw new DocumentValidationException(DocumentValidationError.CorruptHwpx);
        }

        ValidateXml(entries["META-INF/container.xml"], entries, requireContentRoot: true);
        ValidateXml(entries["Contents/content.hpf"], entries, validateReferences: true);
        ValidateXml(entries["Contents/header.xml"], entries);
        foreach (var sectionName in sectionNames)
        {
            ValidateXml(entries[sectionName], entries);
        }

        if (entries.TryGetValue("META-INF/manifest.xml", out var manifest))
        {
            ValidateXml(manifest, entries, rejectEncryptionMarkers: true);
        }

        return new DocumentProperties(null, null, null);
    }

    private static void ValidateXml(
        ZipArchiveEntry entry,
        IReadOnlyDictionary<string, ZipArchiveEntry> entries,
        bool validateReferences = false,
        bool requireContentRoot = false,
        bool rejectEncryptionMarkers = false)
    {
        var settings = new XmlReaderSettings
        {
            DtdProcessing = DtdProcessing.Prohibit,
            XmlResolver = null,
            MaxCharactersInDocument = 16L * 1024 * 1024,
            MaxCharactersFromEntities = 0,
            IgnoreComments = true,
            IgnoreProcessingInstructions = true,
        };

        try
        {
            using var input = entry.Open();
            using var reader = XmlReader.Create(input, settings);
            var contentRootFound = false;
            while (reader.Read())
            {
                if (reader.NodeType != XmlNodeType.Element)
                {
                    continue;
                }

                if (rejectEncryptionMarkers &&
                    (reader.LocalName.Contains("encrypt", StringComparison.OrdinalIgnoreCase) ||
                     reader.LocalName.Contains("cipher", StringComparison.OrdinalIgnoreCase)))
                {
                    throw new DocumentValidationException(DocumentValidationError.EncryptedHwpx);
                }

                if (!reader.HasAttributes)
                {
                    continue;
                }

                while (reader.MoveToNextAttribute())
                {
                    if (rejectEncryptionMarkers &&
                        (reader.LocalName.Contains("encrypt", StringComparison.OrdinalIgnoreCase) ||
                         reader.LocalName.Contains("cipher", StringComparison.OrdinalIgnoreCase)))
                    {
                        throw new DocumentValidationException(DocumentValidationError.EncryptedHwpx);
                    }

                    if (requireContentRoot && reader.LocalName == "full-path" &&
                        reader.Value.EndsWith("content.hpf", StringComparison.Ordinal))
                    {
                        contentRootFound = true;
                    }

                    if (validateReferences && reader.LocalName == "href")
                    {
                        var target = ResolvePackagePath(entry.FullName, reader.Value);
                        if (!entries.ContainsKey(target))
                        {
                            throw new DocumentValidationException(DocumentValidationError.CorruptHwpx);
                        }
                    }
                }
                reader.MoveToElement();
            }

            if (requireContentRoot && !contentRootFound)
            {
                throw new DocumentValidationException(DocumentValidationError.CorruptHwpx);
            }
        }
        catch (DocumentValidationException)
        {
            throw;
        }
        catch (Exception exception) when (exception is XmlException or InvalidDataException or IOException)
        {
            throw new DocumentValidationException(DocumentValidationError.CorruptHwpx);
        }
    }

    private static string ValidateEntryName(string name)
    {
        if (string.IsNullOrWhiteSpace(name) || name.Contains('\\') || name.Contains('\0') ||
            name.StartsWith('/') || Path.IsPathRooted(name))
        {
            throw new DocumentValidationException(DocumentValidationError.UnsafeHwpxContent);
        }

        if (name.Split('/').Any(static segment => segment is "." or ".."))
        {
            throw new DocumentValidationException(DocumentValidationError.UnsafeHwpxContent);
        }

        return name;
    }

    private static void RejectActiveEntry(string name)
    {
        if (name.StartsWith("Scripts/", StringComparison.OrdinalIgnoreCase) ||
            name.Contains("/Scripts/", StringComparison.OrdinalIgnoreCase))
        {
            throw new DocumentValidationException(DocumentValidationError.UnsafeHwpxContent);
        }

        if (name.StartsWith("BinData/", StringComparison.OrdinalIgnoreCase) &&
            BlockedEmbeddedExtensions.Contains(Path.GetExtension(name)))
        {
            throw new DocumentValidationException(DocumentValidationError.UnsafeHwpxContent);
        }
    }

    private static string ResolvePackagePath(string basePath, string href)
    {
        var value = href.Split('#', 2)[0];
        if (string.IsNullOrWhiteSpace(value) || value.Contains('\\') || Uri.TryCreate(value, UriKind.Absolute, out _))
        {
            throw new DocumentValidationException(DocumentValidationError.UnsafeHwpxContent);
        }

        var segments = basePath.Split('/').SkipLast(1).ToList();
        foreach (var segment in Uri.UnescapeDataString(value).Split('/'))
        {
            if (string.IsNullOrEmpty(segment) || segment == ".")
            {
                continue;
            }
            if (segment == "..")
            {
                if (segments.Count == 0)
                {
                    throw new DocumentValidationException(DocumentValidationError.UnsafeHwpxContent);
                }
                segments.RemoveAt(segments.Count - 1);
            }
            else
            {
                segments.Add(segment);
            }
        }

        return ValidateEntryName(string.Join('/', segments));
    }

    private static void Require(IReadOnlyDictionary<string, ZipArchiveEntry> entries, string name)
    {
        if (!entries.ContainsKey(name))
        {
            throw new DocumentValidationException(DocumentValidationError.CorruptHwpx);
        }
    }
}
