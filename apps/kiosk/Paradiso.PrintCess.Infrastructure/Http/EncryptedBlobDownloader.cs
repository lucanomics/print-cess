using System.IO;
using System.Net.Http;
using System.Net.Http.Headers;
using Paradiso.PrintCess.Core.Protocol;

namespace Paradiso.PrintCess.Infrastructure.Http;

public sealed class EncryptedBlobDownloader
{
    private readonly HttpClient _httpClient;
    private readonly bool _allowLoopbackHttp;
    private readonly HashSet<string> _allowedHosts;

    public EncryptedBlobDownloader(
        HttpClient httpClient,
        IEnumerable<string> allowedHosts,
        bool allowLoopbackHttp = false)
    {
        _httpClient = httpClient;
        _allowLoopbackHttp = allowLoopbackHttp;
        ArgumentNullException.ThrowIfNull(allowedHosts);
        _allowedHosts = new HashSet<string>(
            allowedHosts.Where(static host => !string.IsNullOrWhiteSpace(host)).Select(static host => host.Trim()),
            StringComparer.OrdinalIgnoreCase);
        if (_allowedHosts.Count == 0)
        {
            throw new ArgumentException("At least one encrypted blob host must be allowlisted.", nameof(allowedHosts));
        }
    }

    public async Task<byte[]> DownloadAsync(
        Uri signedDownloadUri,
        IReadOnlyDictionary<string, string>? requiredHeaders,
        int expectedSize,
        string expectedEtag,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(signedDownloadUri);
        if (expectedSize is <= BinaryEnvelope.HeaderBytes + BinaryEnvelope.TagBytes or > BinaryEnvelope.MaxEnvelopeBytes ||
            !EntityTagHeaderValue.TryParse(expectedEtag, out var committedEtag))
        {
            throw new BlobDownloadException("Committed encrypted blob metadata is invalid.");
        }

        if (!signedDownloadUri.IsAbsoluteUri ||
            !string.IsNullOrEmpty(signedDownloadUri.UserInfo) ||
            !_allowedHosts.Contains(signedDownloadUri.IdnHost) ||
            (signedDownloadUri.Scheme != Uri.UriSchemeHttps && !IsAllowedLoopback(signedDownloadUri)))
        {
            throw new BlobDownloadException("Signed download endpoint is not permitted.");
        }

        using var request = new HttpRequestMessage(HttpMethod.Get, signedDownloadUri);
        if (requiredHeaders is { Count: > 0 })
        {
            throw new BlobDownloadException("Signed download headers are not permitted by kiosk policy.");
        }

        HttpResponseMessage response;
        try
        {
            response = await _httpClient.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, cancellationToken)
                .ConfigureAwait(false);
        }
        catch (Exception exception) when (
            exception is HttpRequestException ||
            (exception is TaskCanceledException && !cancellationToken.IsCancellationRequested))
        {
            throw new BlobDownloadException("Encrypted blob download failed.", exception);
        }

        using (response)
        {
            if (!response.IsSuccessStatusCode)
            {
                throw new BlobDownloadException($"Encrypted blob endpoint returned status {(int)response.StatusCode}.");
            }

            if (response.Content.Headers.ContentLength is { } contentLength && contentLength != expectedSize)
            {
                throw new BlobDownloadException("Encrypted blob size does not match committed metadata.");
            }

            var responseEtag = response.Headers.ETag;
            if (responseEtag is null || responseEtag.IsWeak != committedEtag.IsWeak ||
                !string.Equals(responseEtag.Tag, committedEtag.Tag, StringComparison.Ordinal))
            {
                throw new BlobDownloadException("Encrypted blob ETag does not match committed metadata.");
            }

            await using var input = await response.Content.ReadAsStreamAsync(cancellationToken).ConfigureAwait(false);
            using var output = new MemoryStream(expectedSize);
            var buffer = new byte[64 * 1024];
            while (true)
            {
                var read = await input.ReadAsync(buffer, cancellationToken).ConfigureAwait(false);
                if (read == 0)
                {
                    break;
                }

                if (output.Length + read > expectedSize)
                {
                    throw new BlobDownloadException("Encrypted blob size does not match committed metadata.");
                }

                await output.WriteAsync(buffer.AsMemory(0, read), cancellationToken).ConfigureAwait(false);
            }

            if (output.Length != expectedSize)
            {
                throw new BlobDownloadException("Encrypted blob size does not match committed metadata.");
            }

            return output.ToArray();
        }
    }

    private bool IsAllowedLoopback(Uri uri) =>
        _allowLoopbackHttp && uri.Scheme == Uri.UriSchemeHttp && uri.IsLoopback;
}

public sealed class BlobDownloadException : IOException
{
    public BlobDownloadException(string message)
        : base(message)
    {
    }

    public BlobDownloadException(string message, Exception innerException)
        : base(message, innerException)
    {
    }
}
