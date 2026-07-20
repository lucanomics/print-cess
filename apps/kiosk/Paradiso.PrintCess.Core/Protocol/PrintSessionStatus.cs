using System.Text.Json;
using System.Text.Json.Serialization;

namespace Paradiso.PrintCess.Core.Protocol;

[JsonConverter(typeof(PrintSessionStatusJsonConverter))]
public enum PrintSessionStatus
{
    Waiting,
    Claimed,
    UploadAuthorized,
    Uploading,
    Uploaded,
    Consumed,
    Validating,
    Printing,
    Completed,
    Failed,
    Expired,
    Cancelled,
}

public sealed class PrintSessionStatusJsonConverter : JsonConverter<PrintSessionStatus>
{
    private static readonly Dictionary<string, PrintSessionStatus> ByName =
        new Dictionary<string, PrintSessionStatus>(StringComparer.Ordinal)
        {
            ["waiting"] = PrintSessionStatus.Waiting,
            ["claimed"] = PrintSessionStatus.Claimed,
            ["upload_authorized"] = PrintSessionStatus.UploadAuthorized,
            ["uploading"] = PrintSessionStatus.Uploading,
            ["uploaded"] = PrintSessionStatus.Uploaded,
            ["consumed"] = PrintSessionStatus.Consumed,
            ["validating"] = PrintSessionStatus.Validating,
            ["printing"] = PrintSessionStatus.Printing,
            ["completed"] = PrintSessionStatus.Completed,
            ["failed"] = PrintSessionStatus.Failed,
            ["expired"] = PrintSessionStatus.Expired,
            ["cancelled"] = PrintSessionStatus.Cancelled,
        };

    private static readonly Dictionary<PrintSessionStatus, string> ByValue =
        ByName.ToDictionary(static pair => pair.Value, static pair => pair.Key);

    public override PrintSessionStatus Read(
        ref Utf8JsonReader reader,
        Type typeToConvert,
        JsonSerializerOptions options)
    {
        var value = reader.GetString();
        if (value is null || !ByName.TryGetValue(value, out var status))
        {
            throw new JsonException("Unsupported print session status.");
        }

        return status;
    }

    public override void Write(
        Utf8JsonWriter writer,
        PrintSessionStatus value,
        JsonSerializerOptions options)
    {
        if (!ByValue.TryGetValue(value, out var name))
        {
            throw new JsonException("Unsupported print session status.");
        }

        writer.WriteStringValue(name);
    }
}
