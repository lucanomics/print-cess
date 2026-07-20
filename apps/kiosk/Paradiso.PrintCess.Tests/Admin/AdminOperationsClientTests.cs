using System.Net;
using System.Text;
using Paradiso.PrintCess.Infrastructure.Admin;

namespace Paradiso.PrintCess.Tests.Admin;

public sealed class AdminOperationsClientTests
{
    [Fact]
    public async Task MapsVerifiedAndConfiguredOnlyHealthWithoutExposingSecret()
    {
        const string secret = "administrator-health-secret-value";
        using var http = new HttpClient(new StubHandler(request =>
        {
            Assert.Equal(HttpMethod.Get, request.Method);
            Assert.Equal("/api/admin/health", request.RequestUri?.AbsolutePath);
            Assert.Equal(secret, Assert.Single(request.Headers.GetValues("x-admin-secret")));
            Assert.Equal("https://print.example", Assert.Single(request.Headers.GetValues("Origin")));
            return Task.FromResult(Json(HttpStatusCode.OK, """
                {"adapterMode":"external","server":"ready","sessionStore":"ready","blob":"configured-unverified","cleanup":"configured-unverified"}
                """));
        }));
        var client = new AdminOperationsClient(http, new Uri("https://print.example"), secret);

        var result = await client.GetHealthAsync(CancellationToken.None);

        Assert.Equal(AdminProviderStatus.VerifiedReady, result.Server);
        Assert.Equal(AdminProviderStatus.VerifiedReady, result.SessionStore);
        Assert.Equal(AdminProviderStatus.ConfiguredUnverified, result.Blob);
        Assert.Equal(AdminProviderStatus.ConfiguredUnverified, result.Cleanup);
    }

    [Fact]
    public async Task AcceptsVerifiedLocalAdapters()
    {
        using var http = new HttpClient(new StubHandler(_ => Task.FromResult(Json(HttpStatusCode.OK, """
            {"adapterMode":"local","server":"ready","sessionStore":"ready","blob":"encrypted-local-ready","cleanup":"in-process-ready"}
            """))));
        var client = new AdminOperationsClient(http, new Uri("http://localhost:3000"), "local-secret");

        var result = await client.GetHealthAsync(CancellationToken.None);

        Assert.All(
            [result.Server, result.SessionStore, result.Blob, result.Cleanup],
            status => Assert.Equal(AdminProviderStatus.VerifiedReady, status));
    }

    [Fact]
    public async Task PostsBoundedSweepAndValidatesAggregateCounts()
    {
        using var http = new HttpClient(new StubHandler(async request =>
        {
            Assert.Equal(HttpMethod.Post, request.Method);
            Assert.Equal("/api/cleanup", request.RequestUri?.AbsolutePath);
            Assert.Equal("{\"sweep\":true,\"limit\":25}", await request.Content!.ReadAsStringAsync());
            return Json(HttpStatusCode.OK, """
                {"ok":true,"attempted":4,"deleted":2,"deferred":1,"failed":1}
                """);
        }));
        var client = new AdminOperationsClient(http, new Uri("https://print.example"), "admin-secret");

        var result = await client.SweepDueOrphansAsync(25, CancellationToken.None);

        Assert.Equal(4, result.Attempted);
        Assert.Equal(2, result.Deleted);
        Assert.Equal(1, result.Deferred);
        Assert.Equal(1, result.Failed);
        Assert.Equal(25, result.Limit);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(101)]
    public async Task RejectsSweepLimitOutsideServerBound(int limit)
    {
        using var http = new HttpClient(new StubHandler(_ => throw new InvalidOperationException("HTTP must not run.")));
        var client = new AdminOperationsClient(http, new Uri("https://print.example"), "admin-secret");

        await Assert.ThrowsAsync<ArgumentOutOfRangeException>(() =>
            client.SweepDueOrphansAsync(limit, CancellationToken.None));
    }

    [Fact]
    public async Task RejectsUnknownHealthShapeAndInconsistentSweepResponse()
    {
        var calls = 0;
        using var http = new HttpClient(new StubHandler(_ =>
        {
            calls++;
            return Task.FromResult(calls == 1
                ? Json(HttpStatusCode.OK, """
                    {"adapterMode":"external","server":"ready","sessionStore":"ready","blob":"configured-unverified","cleanup":"configured-unverified","detail":"must-not-be-accepted"}
                    """)
                : Json(HttpStatusCode.OK, """
                    {"ok":true,"attempted":2,"deleted":2,"deferred":1,"failed":0}
                    """));
        }));
        var client = new AdminOperationsClient(http, new Uri("https://print.example"), "admin-secret");

        await Assert.ThrowsAsync<AdminOperationsException>(() =>
            client.GetHealthAsync(CancellationToken.None));
        await Assert.ThrowsAsync<AdminOperationsException>(() =>
            client.SweepDueOrphansAsync(25, CancellationToken.None));
    }

    [Fact]
    public async Task MissingCredentialFailsBeforeNetworkRequest()
    {
        using var http = new HttpClient(new StubHandler(_ => throw new InvalidOperationException("HTTP must not run.")));
        var client = new AdminOperationsClient(http, new Uri("https://print.example"), null);

        Assert.False(client.IsConfigured);
        await Assert.ThrowsAsync<AdminOperationsException>(() =>
            client.GetHealthAsync(CancellationToken.None));
    }

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

        protected override Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request,
            CancellationToken cancellationToken) => _send(request);
    }
}
