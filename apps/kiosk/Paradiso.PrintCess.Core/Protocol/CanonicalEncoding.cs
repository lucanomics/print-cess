namespace Paradiso.PrintCess.Core.Protocol;

public static class CanonicalEncoding
{
    public static void ValidateSessionId(string value) =>
        ValidateBase64Url(value, ProtocolConstants.SessionIdCharacters, ProtocolConstants.SessionIdBytes, "session ID");

    public static void ValidateFingerprint(string value) =>
        ValidateBase64Url(value, ProtocolConstants.FingerprintCharacters, ProtocolConstants.FingerprintBytes, "public-key fingerprint");

    public static void ValidatePublicKey(string value)
    {
        ValidateBase64Url(value, ProtocolConstants.PublicKeyCharacters, BinaryEnvelope.PublicKeyBytes, "public key");
        var decoded = DecodeBase64Url(value);
        try
        {
            if (decoded[0] != 0x04)
            {
                throw new ProtocolException("The public key is not an uncompressed P-256 point.");
            }
        }
        finally
        {
            Array.Clear(decoded);
        }
    }

    public static byte[] DecodeBase64Url(string value)
    {
        ArgumentNullException.ThrowIfNull(value);
        var padded = value.Replace('-', '+').Replace('_', '/');
        padded = padded.PadRight((padded.Length + 3) / 4 * 4, '=');
        try
        {
            return Convert.FromBase64String(padded);
        }
        catch (FormatException exception)
        {
            throw new ProtocolException("Value is not canonical base64url.", exception);
        }
    }

    public static string EncodeBase64Url(ReadOnlySpan<byte> bytes) =>
        Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');

    private static void ValidateBase64Url(string value, int characterCount, int byteCount, string field)
    {
        if (value.Length != characterCount || value.Any(static character =>
                !(character is >= 'A' and <= 'Z' or >= 'a' and <= 'z' or >= '0' and <= '9' or '-' or '_')))
        {
            throw new ProtocolException($"The {field} is not canonical base64url.");
        }

        var decoded = DecodeBase64Url(value);
        try
        {
            if (decoded.Length != byteCount || !string.Equals(EncodeBase64Url(decoded), value, StringComparison.Ordinal))
            {
                throw new ProtocolException($"The {field} is not canonical base64url.");
            }
        }
        finally
        {
            Array.Clear(decoded);
        }
    }
}
