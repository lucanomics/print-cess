using System.Net;
using System.Net.Http;
using System.Text;
using Paradiso.PrintCess.Core.Protocol;
using Paradiso.PrintCess.Infrastructure.Http;
using Paradiso.PrintCess.Tests.Fixtures;

namespace Paradiso.PrintCess.Tests.Http;

public sealed class KioskSessionClientTests
{
    [Fact]
    public async Task CreatesSessionWithRegistrationCredentialAndValidatesQrBinding()
    {
        var publicKey = new byte[65];
        publicKey[0] = 0x04;
        var encodedKey = CanonicalEncoding.EncodeBase64Url(publicKey);
        var fingerprint = TestDocuments.Fingerprint(publicKey);
        var uploadToken = Token(1);
        var kioskToken = Token(2);
        var qrUrl = $"http://localhost:3000/s/{TestDocuments.SessionId}#t={uploadToken}&fp={fingerprint}";
        var handler = new StubHandler(async request =>
        {
            Assert.Equal(HttpMethod.Post, request.Method);
            Assert.Equal("/api/sessions", request.RequestUri?.AbsolutePath);
            Assert.Equal("device-secret", Assert.Single(request.Headers.GetValues("x-kiosk-registration-secret")));
            Assert.Equal("http://localhost:3000", Assert.Single(request.Headers.GetValues("Origin")));
            var body = await request.Content!.ReadAsStringAsync();
            Assert.Contains(encodedKey, body, StringComparison.Ordinal);
            return Json(HttpStatusCode.Created, $$"""
                {"protocolVersion":1,"sessionId":"{{TestDocuments.SessionId}}","status":"waiting","expiresAt":4102444800000,"kioskToken":"{{kioskToken}}","qrUrl":"{{qrUrl}}"}
                """);
        });
        using var http = new HttpClient(handler);
        var client = new KioskSessionClient(http, new Uri("http://localhost:3000"), "device-secret");

        var registration = await client.CreateAsync(encodedKey, fingerprint, CancellationToken.None);

        Assert.Equal(TestDocuments.SessionId, registration.SessionId);
        Assert.Equal(PrintSessionStatus.Waiting, registration.Status);
    }

    [Fact]
    public async Task DeclaresBothHancomFormatsTogetherSoLegacyHwpIsNeverUnderReported()
    {
        var publicKey = new byte[65];
        publicKey[0] = 0x04;
        var encodedKey = CanonicalEncoding.EncodeBase64Url(publicKey);
        var fingerprint = TestDocuments.Fingerprint(publicKey);
        var uploadToken = Token(4);
        var kioskToken = Token(5);
        var qrUrl = $"http://localhost:3000/s/{TestDocuments.SessionId}#t={uploadToken}&fp={fingerprint}";
        string? capturedBody = null;
        var handler = new StubHandler(async request =>
        {
            capturedBody = await request.Content!.ReadAsStringAsync();
            return Json(HttpStatusCode.Created, $$"""
                {"protocolVersion":1,"sessionId":"{{TestDocuments.SessionId}}","status":"waiting","expiresAt":4102444800000,"kioskToken":"{{kioskToken}}","qrUrl":"{{qrUrl}}"}
                """);
        });
        using var http = new HttpClient(handler);
        var client = new KioskSessionClient(http, new Uri("http://localhost:3000"), null);

        await client.CreateAsync(encodedKey, fingerprint, CancellationToken.None);

        // One Hancom automation object renders both formats. Sending only
        // `supportsHwpx` told the service this kiosk could not open a .hwp file
        // it can in fact print, and the web layer hid that by inferring legacy
        // support from the newer flag. Both must be stated outright.
        Assert.NotNull(capturedBody);
        Assert.Contains("\"supportsHwpx\"", capturedBody, StringComparison.Ordinal);
        Assert.Contains("\"supportsHwp\"", capturedBody, StringComparison.Ordinal);
        var hwpx = capturedBody!.Contains("\"supportsHwpx\":true", StringComparison.Ordinal);
        var hwp = capturedBody.Contains("\"supportsHwp\":true", StringComparison.Ordinal);
        Assert.Equal(hwpx, hwp);
    }

    [Fact]
    public async Task ConsumesUploadedSessionWithScopedKioskHeader()
    {
        var kioskToken = Token(3);
        var consumeHash = CanonicalEncoding.EncodeBase64Url(Enumerable.Repeat((byte)7, 32).ToArray());
        var handler = new StubHandler(async request =>
        {
            Assert.Equal($"/api/sessions/{TestDocuments.SessionId}/consume", request.RequestUri?.AbsolutePath);
            Assert.Equal(kioskToken, Assert.Single(request.Headers.GetValues("x-print-cess-kiosk-token")));
            Assert.Contains(consumeHash, await request.Content!.ReadAsStringAsync(), StringComparison.Ordinal);
            return Json(HttpStatusCode.OK, $$"""
                {"sessionId":"{{TestDocuments.SessionId}}","status":"consumed","method":"GET","url":"https://blob.example/encrypted","headers":{},"expiresAt":4102444800000,"etag":"synthetic-etag","size":200}
                """);
        });
        using var http = new HttpClient(handler);
        var client = new KioskSessionClient(http, new Uri("https://print.example"), null);

        var lease = await client.ConsumeAsync(TestDocuments.SessionId, kioskToken, consumeHash, CancellationToken.None);

        Assert.Equal(200, lease.Size);
        Assert.Equal("https://blob.example/encrypted", lease.Url);
    }

    [Fact]
    public async Task ErrorsDoNotExposeRequestUriOrCredential()
    {
        var secret = Token(4);
        using var http = new HttpClient(new StubHandler(_ => Task.FromResult(new HttpResponseMessage(HttpStatusCode.ServiceUnavailable))));
        var client = new KioskSessionClient(http, new Uri("https://print.example"), null);

        var exception = await Assert.ThrowsAsync<KioskApiException>(() =>
            client.GetStatusAsync(TestDocuments.SessionId, secret, CancellationToken.None));

        Assert.DoesNotContain(secret, exception.ToString(), StringComparison.Ordinal);
        Assert.DoesNotContain(TestDocuments.SessionId, exception.ToString(), StringComparison.Ordinal);
        Assert.DoesNotContain("print.example", exception.ToString(), StringComparison.Ordinal);
    }

    [Fact]
    public async Task RejectsQrFragmentParameterSmuggling()
    {
        var publicKey = new byte[65];
        publicKey[0] = 0x04;
        var encodedKey = CanonicalEncoding.EncodeBase64Url(publicKey);
        var fingerprint = TestDocuments.Fingerprint(publicKey);
        var qrUrl = $"http://localhost:3000/s/{TestDocuments.SessionId}#xt={Token(1)}&fp={fingerprint}";
        using var http = new HttpClient(new StubHandler(_ => Task.FromResult(Json(HttpStatusCode.Created, $$"""
            {"protocolVersion":1,"sessionId":"{{TestDocuments.SessionId}}","status":"waiting","expiresAt":4102444800000,"kioskToken":"{{Token(2)}}","qrUrl":"{{qrUrl}}"}
            """))));
        var client = new KioskSessionClient(http, new Uri("http://localhost:3000"), null);

        await Assert.ThrowsAsync<KioskApiException>(() =>
            client.CreateAsync(encodedKey, fingerprint, CancellationToken.None));
    }

    [Fact]
    public async Task RejectsMismatchedCancellationResponse()
    {
        using var http = new HttpClient(new StubHandler(_ => Task.FromResult(Json(HttpStatusCode.OK, $$"""
            {"sessionId":"{{TestDocuments.SessionId}}","status":"completed"}
            """))));
        var client = new KioskSessionClient(http, new Uri("https://print.example"), null);

        await Assert.ThrowsAsync<KioskApiException>(() =>
            client.CancelAsync(TestDocuments.SessionId, Token(5), CancellationToken.None));
    }

    [Fact]
    public async Task PreservesCallerCancellationForSessionRotation()
    {
        using var cancellation = new CancellationTokenSource();
        cancellation.Cancel();
        using var http = new HttpClient(new StubHandler(_ =>
            Task.FromCanceled<HttpResponseMessage>(cancellation.Token)));
        var client = new KioskSessionClient(http, new Uri("https://print.example"), null);

        var exception = await Assert.ThrowsAnyAsync<OperationCanceledException>(() =>
            client.GetStatusAsync(TestDocuments.SessionId, Token(6), cancellation.Token));

        Assert.IsNotType<KioskApiException>(exception);
    }

    private static string Token(byte value) =>
        CanonicalEncoding.EncodeBase64Url(Enumerable.Repeat(value, 32).ToArray());

    private static HttpResponseMessage Json(HttpStatusCode status, string json) => new(status)
    {
        Content = new StringContent(json, Encoding.UTF8, "application/json"),
    };

    private sealed class StubHandler : HttpMessageHandler
    {
        private readonly Func<HttpRequestMessage, Task<HttpResponseMessage>> _send;

        public StubHandler(Func<HttpRequestMessage, Task<HttpResponseMessage>> send)
        {
            _send = send;
        }

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken) =>
            _send(request);
    }
}
