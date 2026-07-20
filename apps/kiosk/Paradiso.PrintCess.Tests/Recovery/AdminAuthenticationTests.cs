using System.Security.Cryptography;
using System.Text;
using Paradiso.PrintCess.Core.Protocol;
using Paradiso.PrintCess.Infrastructure.Admin;

namespace Paradiso.PrintCess.Tests.Recovery;

public sealed class AdminAuthenticationTests
{
    [Fact]
    public async Task UsesExternalPbkdf2CredentialAndFailsClosedWhenMissing()
    {
        const string password = "synthetic-test-password";
        var salt = Enumerable.Range(0, 16).Select(static value => (byte)value).ToArray();
        var hash = Rfc2898DeriveBytes.Pbkdf2(
            Encoding.UTF8.GetBytes(password),
            salt,
            210_000,
            HashAlgorithmName.SHA256,
            32);
        var encoded = $"pbkdf2-sha256$210000${CanonicalEncoding.EncodeBase64Url(salt)}${CanonicalEncoding.EncodeBase64Url(hash)}";
        var configured = new Pbkdf2AdminAuthenticator(encoded);
        var missing = new Pbkdf2AdminAuthenticator(null);

        Assert.True((await configured.AuthenticateAsync(password.AsMemory(), CancellationToken.None)).Succeeded);
        Assert.False((await configured.AuthenticateAsync("wrong".AsMemory(), CancellationToken.None)).Succeeded);
        Assert.False((await missing.AuthenticateAsync(password.AsMemory(), CancellationToken.None)).Succeeded);
        Assert.False(missing.IsConfigured);
    }
}
