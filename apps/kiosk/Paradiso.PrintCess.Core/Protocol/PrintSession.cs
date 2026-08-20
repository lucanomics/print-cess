using System.Text.Json;
using System.Text.Json.Serialization;

namespace Paradiso.PrintCess.Core.Protocol;

public sealed record PrintSession
{
    [JsonPropertyName("protocolVersion")]
    public int ProtocolVersion { get; init; } = ProtocolConstants.Version;

    [JsonPropertyName("sessionId")]
    public required string SessionId { get; init; }

    [JsonPropertyName("status")]
    public required PrintSessionStatus Status { get; init; }

    [JsonPropertyName("kioskPublicKey")]
    public required string KioskPublicKey { get; init; }

    [JsonPropertyName("kioskPublicKeyFingerprint")]
    public required string KioskPublicKeyFingerprint { get; init; }

    [JsonPropertyName("encryptedBlobPath")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? EncryptedBlobPath { get; init; }

    [JsonPropertyName("encryptedBlobEtag")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? EncryptedBlobEtag { get; init; }

    [JsonPropertyName("encryptedBlobSize")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public long? EncryptedBlobSize { get; init; }

    [JsonPropertyName("createdAt")]
    public required long CreatedAt { get; init; }

    [JsonPropertyName("expiresAt")]
    public required long ExpiresAt { get; init; }

    [JsonPropertyName("uploadTokenHash")]
    public required string UploadTokenHash { get; init; }

    [JsonPropertyName("kioskTokenHash")]
    public required string KioskTokenHash { get; init; }

    [JsonPropertyName("mobileTokenHash")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? MobileTokenHash { get; init; }

    [JsonPropertyName("claimIdHash")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? ClaimIdHash { get; init; }

    [JsonPropertyName("uploadOperationIdHash")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? UploadOperationIdHash { get; init; }

    [JsonPropertyName("consumeIdHash")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? ConsumeIdHash { get; init; }

    [JsonPropertyName("consumeLeaseExpiresAt")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public long? ConsumeLeaseExpiresAt { get; init; }

    [JsonPropertyName("claimedAt")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public long? ClaimedAt { get; init; }

    [JsonPropertyName("completedAt")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public long? CompletedAt { get; init; }

    [JsonPropertyName("revision")]
    public long Revision { get; init; }

    public void ValidateContract()
    {
        if (ProtocolVersion != ProtocolConstants.Version)
        {
            throw new ProtocolException("Unsupported protocol version.");
        }

        CanonicalEncoding.ValidateSessionId(SessionId);
        CanonicalEncoding.ValidatePublicKey(KioskPublicKey);
        CanonicalEncoding.ValidateFingerprint(KioskPublicKeyFingerprint);
        if (!Enum.IsDefined(Status))
        {
            throw new ProtocolException("Session status is invalid.");
        }

        foreach (var hash in new[]
                 {
                     UploadTokenHash,
                     KioskTokenHash,
                     MobileTokenHash,
                     ClaimIdHash,
                     UploadOperationIdHash,
                     ConsumeIdHash,
                 })
        {
            if (hash is not null)
            {
                CanonicalEncoding.ValidateFingerprint(hash);
            }
        }

        if (EncryptedBlobPath is not null && !IsCanonicalBlobPath(EncryptedBlobPath) ||
            EncryptedBlobEtag is { Length: < 1 or > 256 } ||
            EncryptedBlobSize is < BinaryEnvelope.HeaderBytes + BinaryEnvelope.TagBytes + 1 or > BinaryEnvelope.MaxEnvelopeBytes)
        {
            throw new ProtocolException("Session encrypted blob metadata is invalid.");
        }

        if (CreatedAt < 0 || ExpiresAt <= CreatedAt || Revision < 0 || ConsumeLeaseExpiresAt is <= 0 ||
            ClaimedAt is < 0 || CompletedAt is < 0)
        {
            throw new ProtocolException("Session timestamps or revision are invalid.");
        }
    }

    private static bool IsCanonicalBlobPath(string value)
    {
        if (value.Length != 29 || !value.StartsWith("v1/", StringComparison.Ordinal) ||
            !value.EndsWith(".bin", StringComparison.Ordinal))
        {
            return false;
        }

        return value.AsSpan(3, 22).IndexOfAnyExcept(
            "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-".AsSpan()) < 0;
    }
}

public sealed record CreateSessionRequest(
    [property: JsonPropertyName("protocolVersion")] int ProtocolVersion,
    [property: JsonPropertyName("kioskPublicKey")] string KioskPublicKey,
    [property: JsonPropertyName("kioskPublicKeyFingerprint")] string KioskPublicKeyFingerprint,
    [property: JsonPropertyName("supportsHwpx")] bool SupportsHwpx = false,
    [property: JsonPropertyName("supportsHwp")] bool SupportsHwp = false,
    [property: JsonPropertyName("supportsBundle")] bool SupportsPrintBundles = false);

public sealed record KioskTransitionRequest(
    [property: JsonPropertyName("status")] PrintSessionStatus Status);

public static class ProtocolJson
{
    public static JsonSerializerOptions CreateOptions() => new(JsonSerializerDefaults.Web)
    {
        PropertyNameCaseInsensitive = false,
        ReadCommentHandling = JsonCommentHandling.Disallow,
        AllowTrailingCommas = false,
        UnmappedMemberHandling = JsonUnmappedMemberHandling.Disallow,
    };
}

public class ProtocolException : Exception
{
    public ProtocolException(string message)
        : base(message)
    {
    }

    public ProtocolException(string message, Exception innerException)
        : base(message, innerException)
    {
    }
}
