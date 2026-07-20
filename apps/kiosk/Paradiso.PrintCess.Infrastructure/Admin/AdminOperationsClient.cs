using System.IO;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Paradiso.PrintCess.Infrastructure.Admin;

public sealed class AdminOperationsClient
{
    public const int MaximumSweepLimit = 100;
    private const int MaximumJsonResponseBytes = 16 * 1024;
    private readonly HttpClient _httpClient;
    private readonly Uri _serverBaseUri;
    private readonly string? _adminSecret;
    private readonly JsonSerializerOptions _jsonOptions = new(JsonSerializerDefaults.Web)
    {
        UnmappedMemberHandling = JsonUnmappedMemberHandling.Disallow,
    };

    public AdminOperationsClient(HttpClient httpClient, Uri serverBaseUri, string? adminSecret)
    {
        ArgumentNullException.ThrowIfNull(httpClient);
        ArgumentNullException.ThrowIfNull(serverBaseUri);
        if (!serverBaseUri.IsAbsoluteUri ||
            !string.IsNullOrEmpty(serverBaseUri.UserInfo) ||
            (!string.Equals(serverBaseUri.Scheme, Uri.UriSchemeHttps, StringComparison.OrdinalIgnoreCase) &&
                !(string.Equals(serverBaseUri.Scheme, Uri.UriSchemeHttp, StringComparison.OrdinalIgnoreCase) && serverBaseUri.IsLoopback)))
        {
            throw new ArgumentException("Administrator operations require HTTPS or loopback development HTTP.", nameof(serverBaseUri));
        }

        _httpClient = httpClient;
        _serverBaseUri = new Uri(serverBaseUri.GetLeftPart(UriPartial.Authority) + "/", UriKind.Absolute);
        _adminSecret = string.IsNullOrWhiteSpace(adminSecret) ? null : adminSecret;
    }

    public bool IsConfigured => _adminSecret is not null;

    public async Task<AdminServiceHealth> GetHealthAsync(CancellationToken cancellationToken)
    {
        EnsureConfigured();
        using var request = CreateRequest(HttpMethod.Get, "api/admin/health");
        var response = await SendAsync<HealthResponse>(request, cancellationToken).ConfigureAwait(false);
        if (response.AdapterMode is not ("local" or "external"))
        {
            throw new AdminOperationsException("Administrator health response was invalid.");
        }

        return new AdminServiceHealth(
            MapStatus(response.Server, verifiedReadyValue: "ready"),
            MapStatus(response.SessionStore, verifiedReadyValue: "ready"),
            MapStatus(response.Blob, verifiedReadyValue: "encrypted-local-ready"),
            MapStatus(response.Cleanup, verifiedReadyValue: "in-process-ready"),
            DateTimeOffset.UtcNow);
    }

    public async Task<AdminOrphanSweepResult> SweepDueOrphansAsync(
        int limit,
        CancellationToken cancellationToken)
    {
        EnsureConfigured();
        if (limit is < 1 or > MaximumSweepLimit)
        {
            throw new ArgumentOutOfRangeException(nameof(limit), limit, $"Sweep limit must be between 1 and {MaximumSweepLimit}.");
        }

        using var request = CreateRequest(HttpMethod.Post, "api/cleanup");
        request.Content = new StringContent(
            JsonSerializer.Serialize(new SweepRequest(true, limit), _jsonOptions),
            Encoding.UTF8,
            "application/json");
        var response = await SendAsync<SweepResponse>(request, cancellationToken).ConfigureAwait(false);
        if (!response.Ok ||
            response.Attempted is < 0 || response.Attempted > limit ||
            response.Deleted is < 0 ||
            response.Deferred is < 0 ||
            response.Failed is < 0 ||
            response.Deleted + response.Deferred + response.Failed != response.Attempted)
        {
            throw new AdminOperationsException("Administrator cleanup response was invalid.");
        }

        return new AdminOrphanSweepResult(
            response.Attempted,
            response.Deleted,
            response.Deferred,
            response.Failed,
            limit,
            DateTimeOffset.UtcNow);
    }

    private HttpRequestMessage CreateRequest(HttpMethod method, string relativePath)
    {
        var request = new HttpRequestMessage(method, new Uri(_serverBaseUri, relativePath));
        request.Headers.TryAddWithoutValidation("x-admin-secret", _adminSecret);
        request.Headers.TryAddWithoutValidation("Origin", _serverBaseUri.GetLeftPart(UriPartial.Authority));
        return request;
    }

    private async Task<T> SendAsync<T>(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        try
        {
            using var response = await _httpClient.SendAsync(
                request,
                HttpCompletionOption.ResponseHeadersRead,
                cancellationToken).ConfigureAwait(false);
            if (!response.IsSuccessStatusCode || response.Content.Headers.ContentLength is > MaximumJsonResponseBytes)
            {
                throw new AdminOperationsException("Administrator operation was not accepted.");
            }

            await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken).ConfigureAwait(false);
            using var limited = new MemoryStream();
            var buffer = new byte[4_096];
            while (true)
            {
                var read = await stream.ReadAsync(buffer, cancellationToken).ConfigureAwait(false);
                if (read == 0)
                {
                    break;
                }

                if (limited.Length + read > MaximumJsonResponseBytes)
                {
                    throw new AdminOperationsException("Administrator response was too large.");
                }

                limited.Write(buffer, 0, read);
            }

            return JsonSerializer.Deserialize<T>(
                limited.GetBuffer().AsSpan(0, checked((int)limited.Length)),
                _jsonOptions) ?? throw new AdminOperationsException("Administrator response was empty.");
        }
        catch (AdminOperationsException)
        {
            throw;
        }
        catch (Exception exception) when (exception is HttpRequestException or IOException or JsonException)
        {
            throw new AdminOperationsException("Administrator operation failed.", exception);
        }
    }

    private void EnsureConfigured()
    {
        if (_adminSecret is null)
        {
            throw new AdminOperationsException("Administrator server credential is not configured.");
        }
    }

    private static AdminProviderStatus MapStatus(string value, string verifiedReadyValue) => value switch
    {
        "ready" when string.Equals(verifiedReadyValue, "ready", StringComparison.Ordinal) => AdminProviderStatus.VerifiedReady,
        "encrypted-local-ready" when string.Equals(verifiedReadyValue, "encrypted-local-ready", StringComparison.Ordinal) => AdminProviderStatus.VerifiedReady,
        "in-process-ready" when string.Equals(verifiedReadyValue, "in-process-ready", StringComparison.Ordinal) => AdminProviderStatus.VerifiedReady,
        "configured-unverified" => AdminProviderStatus.ConfiguredUnverified,
        "unavailable" => AdminProviderStatus.Unavailable,
        _ => throw new AdminOperationsException("Administrator health response contained an unknown status."),
    };

    private sealed record HealthResponse(
        string AdapterMode,
        string Server,
        string SessionStore,
        string Blob,
        string Cleanup);

    private sealed record SweepRequest(bool Sweep, int Limit);

    private sealed record SweepResponse(
        bool Ok,
        int Attempted,
        int Deleted,
        int Deferred,
        int Failed);
}

public enum AdminProviderStatus
{
    NotChecked,
    VerifiedReady,
    ConfiguredUnverified,
    Unavailable,
}

public sealed record AdminServiceHealth(
    AdminProviderStatus Server,
    AdminProviderStatus SessionStore,
    AdminProviderStatus Blob,
    AdminProviderStatus Cleanup,
    DateTimeOffset CheckedAtUtc)
{
    public static AdminServiceHealth NotChecked { get; } = new(
        AdminProviderStatus.NotChecked,
        AdminProviderStatus.NotChecked,
        AdminProviderStatus.NotChecked,
        AdminProviderStatus.NotChecked,
        DateTimeOffset.MinValue);
}

public sealed record AdminOrphanSweepResult(
    int Attempted,
    int Deleted,
    int Deferred,
    int Failed,
    int Limit,
    DateTimeOffset CompletedAtUtc);

public sealed class AdminOperationsException : Exception
{
    public AdminOperationsException(string message)
        : base(message)
    {
    }

    public AdminOperationsException(string message, Exception innerException)
        : base(message, innerException)
    {
    }
}
