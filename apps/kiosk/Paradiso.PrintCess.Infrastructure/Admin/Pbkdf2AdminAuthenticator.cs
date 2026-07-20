using System.Security.Cryptography;
using System.Text;
using Paradiso.PrintCess.Core.Protocol;
using Paradiso.PrintCess.Core.Security;

namespace Paradiso.PrintCess.Infrastructure.Admin;

public sealed class Pbkdf2AdminAuthenticator : IAdminAuthenticator
{
    private const int MinimumIterations = 210_000;
    private readonly Credential? _credential;

    public Pbkdf2AdminAuthenticator(string? encodedCredential)
    {
        _credential = Parse(encodedCredential);
    }

    public bool IsConfigured => _credential is not null;

    public ValueTask<AdminAuthenticationResult> AuthenticateAsync(
        ReadOnlyMemory<char> password,
        CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        if (_credential is null || password.IsEmpty)
        {
            return ValueTask.FromResult(AdminAuthenticationResult.Denied(
                _credential is null ? "ADMIN-NOT-CONFIGURED" : "ADMIN-DENIED"));
        }

        var maximumBytes = Encoding.UTF8.GetMaxByteCount(password.Length);
        var passwordBytes = new byte[maximumBytes];
        var written = Encoding.UTF8.GetBytes(password.Span, passwordBytes);
        var derived = new byte[_credential.Hash.Length];
        try
        {
            Rfc2898DeriveBytes.Pbkdf2(
                passwordBytes.AsSpan(0, written),
                _credential.Salt,
                derived,
                _credential.Iterations,
                HashAlgorithmName.SHA256);
            return ValueTask.FromResult(CryptographicOperations.FixedTimeEquals(derived, _credential.Hash)
                ? AdminAuthenticationResult.Success()
                : AdminAuthenticationResult.Denied());
        }
        finally
        {
            CryptographicOperations.ZeroMemory(passwordBytes);
            CryptographicOperations.ZeroMemory(derived);
        }
    }

    private static Credential? Parse(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        var parts = value.Split('$', StringSplitOptions.None);
        if (parts.Length != 4 || !string.Equals(parts[0], "pbkdf2-sha256", StringComparison.Ordinal) ||
            !int.TryParse(parts[1], out var iterations) || iterations < MinimumIterations)
        {
            return null;
        }

        try
        {
            var salt = CanonicalEncoding.DecodeBase64Url(parts[2]);
            var hash = CanonicalEncoding.DecodeBase64Url(parts[3]);
            if (salt.Length < 16 || hash.Length != 32)
            {
                CryptographicOperations.ZeroMemory(salt);
                CryptographicOperations.ZeroMemory(hash);
                return null;
            }

            return new Credential(iterations, salt, hash);
        }
        catch (ProtocolException)
        {
            return null;
        }
    }

    private sealed record Credential(int Iterations, byte[] Salt, byte[] Hash);
}
