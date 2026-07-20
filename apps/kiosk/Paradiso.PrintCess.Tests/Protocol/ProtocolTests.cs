using System.Text.Json;
using Paradiso.PrintCess.Core.Protocol;
using Paradiso.PrintCess.Core.Sessions;
using Paradiso.PrintCess.Tests.Fixtures;

namespace Paradiso.PrintCess.Tests.Protocol;

public sealed class ProtocolTests
{
    [Fact]
    public void StateMachineMatchesProtocolVersionOne()
    {
        Assert.True(PrintSessionStateMachine.CanTransition(PrintSessionStatus.Waiting, PrintSessionStatus.Claimed));
        Assert.True(PrintSessionStateMachine.CanTransition(PrintSessionStatus.Uploaded, PrintSessionStatus.Consumed));
        Assert.True(PrintSessionStateMachine.CanTransition(PrintSessionStatus.Consumed, PrintSessionStatus.Expired));
        Assert.True(PrintSessionStateMachine.CanTransition(PrintSessionStatus.Printing, PrintSessionStatus.Completed));
        Assert.False(PrintSessionStateMachine.CanTransition(PrintSessionStatus.Waiting, PrintSessionStatus.Printing));
        Assert.False(PrintSessionStateMachine.CanTransition(PrintSessionStatus.Completed, PrintSessionStatus.Waiting));
        Assert.Throws<InvalidSessionTransitionException>(() =>
            PrintSessionStateMachine.EnsureTransition(PrintSessionStatus.Completed, PrintSessionStatus.Waiting));
    }

    [Fact]
    public void DtoUsesCanonicalJsonNamesAndSnakeCaseStatus()
    {
        var key = new byte[65];
        key[0] = 0x04;
        var hash = CanonicalEncoding.EncodeBase64Url(new byte[32]);
        var session = new PrintSession
        {
            SessionId = TestDocuments.SessionId,
            Status = PrintSessionStatus.UploadAuthorized,
            KioskPublicKey = CanonicalEncoding.EncodeBase64Url(key),
            KioskPublicKeyFingerprint = hash,
            UploadTokenHash = hash,
            KioskTokenHash = hash,
            CreatedAt = 1,
            ExpiresAt = 2,
        };

        session.ValidateContract();
        var json = JsonSerializer.Serialize(session, ProtocolJson.CreateOptions());
        Assert.Contains("\"protocolVersion\":1", json, StringComparison.Ordinal);
        Assert.Contains("\"status\":\"upload_authorized\"", json, StringComparison.Ordinal);
        Assert.DoesNotContain("mobileTokenHash", json, StringComparison.Ordinal);
        var decoded = JsonSerializer.Deserialize<PrintSession>(json, ProtocolJson.CreateOptions());
        Assert.Equal(PrintSessionStatus.UploadAuthorized, decoded?.Status);
    }

    [Fact]
    public void DtoRejectsUnknownFieldsAndNonCanonicalIdentifiers()
    {
        var options = ProtocolJson.CreateOptions();
        Assert.Throws<JsonException>(() => JsonSerializer.Deserialize<PrintSession>("{\"protocolVersion\":1,\"unknown\":true}", options));
        Assert.Throws<ProtocolException>(() => CanonicalEncoding.ValidateSessionId("not-a-session"));
        Assert.Throws<ProtocolException>(() => CanonicalEncoding.ValidateSessionId($"{new string('A', 21)}B"));
        Assert.Throws<ProtocolException>(() => CanonicalEncoding.ValidateFingerprint(new string('A', 42)));

        var compressedPrefix = new byte[65];
        compressedPrefix[0] = 0x02;
        Assert.Throws<ProtocolException>(() =>
            CanonicalEncoding.ValidatePublicKey(CanonicalEncoding.EncodeBase64Url(compressedPrefix)));
    }

    [Theory]
    [InlineData(1_000, 1_000)]
    [InlineData(1_000, 999)]
    public void DtoRejectsExpiryThatIsNotLaterThanCreation(long createdAt, long expiresAt)
    {
        var key = new byte[65];
        key[0] = 0x04;
        var hash = CanonicalEncoding.EncodeBase64Url(new byte[32]);
        var session = new PrintSession
        {
            SessionId = TestDocuments.SessionId,
            Status = PrintSessionStatus.Waiting,
            KioskPublicKey = CanonicalEncoding.EncodeBase64Url(key),
            KioskPublicKeyFingerprint = hash,
            UploadTokenHash = hash,
            KioskTokenHash = hash,
            CreatedAt = createdAt,
            ExpiresAt = expiresAt,
        };

        Assert.Throws<ProtocolException>(session.ValidateContract);
    }
}
