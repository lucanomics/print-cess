namespace Paradiso.PrintCess.Core.Protocol;

public static class ProtocolConstants
{
    public const int Version = 1;
    public const int SessionIdBytes = 16;
    public const int SessionIdCharacters = 22;
    public const int FingerprintBytes = 32;
    public const int FingerprintCharacters = 43;
    public const int PublicKeyCharacters = 87;
    public static readonly TimeSpan SessionLifetime = TimeSpan.FromMinutes(3);
    public static readonly TimeSpan CompletionScreenDuration = TimeSpan.FromSeconds(15);
}
