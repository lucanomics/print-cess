namespace Paradiso.PrintCess.Core.Security;

public interface IAdminAuthenticator
{
    bool IsConfigured { get; }

    ValueTask<AdminAuthenticationResult> AuthenticateAsync(
        ReadOnlyMemory<char> password,
        CancellationToken cancellationToken);
}

public sealed record AdminAuthenticationResult(bool Succeeded, string SafeCode)
{
    public static AdminAuthenticationResult Success() => new(true, "ADMIN-OK");

    public static AdminAuthenticationResult Denied(string code = "ADMIN-DENIED") => new(false, code);
}
