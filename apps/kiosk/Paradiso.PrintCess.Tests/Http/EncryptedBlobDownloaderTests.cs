using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using Paradiso.PrintCess.Infrastructure.Http;

namespace Paradiso.PrintCess.Tests.Http;

public sealed class EncryptedBlobDownloaderTests
{
    [Fact]
    public async Task RequiresCommittedSizeAndStrongEtagToMatch()
    {
        var bytes = new byte[200];
        var response = new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new ByteArrayContent(bytes),
        };
        response.Headers.ETag = new EntityTagHeaderValue("\"committed\"");
        using var client = new HttpClient(new SingleResponseHandler(response));
        var downloader = new EncryptedBlobDownloader(client, ["blob.example"]);

        var downloaded = await downloader.DownloadAsync(
            new Uri("https://blob.example/document"),
            null,
            bytes.Length,
            "\"committed\"",
            CancellationToken.None);

        Assert.Equal(bytes, downloaded);
    }

    [Theory]
    [InlineData(199, "\"committed\"")]
    [InlineData(200, "\"changed\"")]
    [InlineData(200, "W/\"committed\"")]
    public async Task RejectsMetadataMismatch(int expectedSize, string expectedEtag)
    {
        var response = new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new ByteArrayContent(new byte[200]),
        };
        response.Headers.ETag = new EntityTagHeaderValue("\"committed\"");
        using var client = new HttpClient(new SingleResponseHandler(response));
        var downloader = new EncryptedBlobDownloader(client, ["blob.example"]);

        await Assert.ThrowsAsync<BlobDownloadException>(() => downloader.DownloadAsync(
            new Uri("https://blob.example/document"),
            null,
            expectedSize,
            expectedEtag,
            CancellationToken.None));
    }

    [Fact]
    public async Task RejectsDownloadHostOutsideDeploymentAllowlist()
    {
        using var client = new HttpClient(new SingleResponseHandler(new HttpResponseMessage(HttpStatusCode.OK)));
        var downloader = new EncryptedBlobDownloader(client, ["approved.blob.example"]);

        await Assert.ThrowsAsync<BlobDownloadException>(() => downloader.DownloadAsync(
            new Uri("https://intranet.example/document"),
            null,
            200,
            "\"committed\"",
            CancellationToken.None));
    }

    [Fact]
    public async Task RejectsServerSuppliedDownloadHeaders()
    {
        using var client = new HttpClient(new SingleResponseHandler(new HttpResponseMessage(HttpStatusCode.OK)));
        var downloader = new EncryptedBlobDownloader(client, ["blob.example"]);

        await Assert.ThrowsAsync<BlobDownloadException>(() => downloader.DownloadAsync(
            new Uri("https://blob.example/document"),
            new Dictionary<string, string> { ["Authorization"] = "untrusted" },
            200,
            "\"committed\"",
            CancellationToken.None));
    }

    [Fact]
    public async Task PreservesCallerCancellationForSafeSessionRotation()
    {
        using var cancellation = new CancellationTokenSource();
        cancellation.Cancel();
        using var client = new HttpClient(new CancellingHandler(cancellation.Token));
        var downloader = new EncryptedBlobDownloader(client, ["blob.example"]);

        var exception = await Assert.ThrowsAnyAsync<OperationCanceledException>(() =>
            downloader.DownloadAsync(
                new Uri("https://blob.example/document"),
                null,
                200,
                "\"committed\"",
                cancellation.Token));

        Assert.IsNotType<BlobDownloadException>(exception);
    }

    private sealed class SingleResponseHandler : HttpMessageHandler
    {
        private readonly HttpResponseMessage _response;

        public SingleResponseHandler(HttpResponseMessage response)
        {
            _response = response;
        }

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken) =>
            Task.FromResult(_response);
    }

    private sealed class CancellingHandler : HttpMessageHandler
    {
        private readonly CancellationToken _cancellationToken;

        public CancellingHandler(CancellationToken cancellationToken)
        {
            _cancellationToken = cancellationToken;
        }

        protected override Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request,
            CancellationToken cancellationToken) =>
            Task.FromCanceled<HttpResponseMessage>(_cancellationToken);
    }
}
