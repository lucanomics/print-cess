using Paradiso.PrintCess.Core.Documents;
using Paradiso.PrintCess.Core.Protocol;

namespace Paradiso.PrintCess.Tests.Protocol;

public sealed class EnvelopeParserTests
{
    [Fact]
    public void ParsesExactVersionOneLayout()
    {
        var publicKey = new byte[BinaryEnvelope.PublicKeyBytes];
        publicKey[0] = 0x04;
        var salt = Enumerable.Range(0, BinaryEnvelope.SaltBytes).Select(static value => (byte)value).ToArray();
        var iv = Enumerable.Range(0, BinaryEnvelope.IvBytes).Select(static value => (byte)(0xa0 + value)).ToArray();
        var header = BinaryEnvelope.CreateHeader(DocumentKind.Pdf, 3, publicKey, salt, iv);
        var envelope = BinaryEnvelope.Assemble(header, new byte[3 + BinaryEnvelope.TagBytes]);

        var parsed = BinaryEnvelope.Parse(envelope);

        Assert.Equal(BinaryEnvelope.HeaderBytes, 135);
        Assert.Equal(DocumentKind.Pdf, parsed.FileKind);
        Assert.Equal(3, parsed.PlaintextLength);
        Assert.Equal(publicKey, parsed.EphemeralPublicKey);
        Assert.Equal(salt, parsed.Salt);
        Assert.Equal(iv, parsed.Iv);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(8)]
    [InlineData(10)]
    [InlineData(12)]
    [InlineData(14)]
    [InlineData(15)]
    [InlineData(16)]
    [InlineData(17)]
    [InlineData(22)]
    public void RejectsMalformedHeaderFields(int offset)
    {
        var publicKey = new byte[BinaryEnvelope.PublicKeyBytes];
        publicKey[0] = 0x04;
        var header = BinaryEnvelope.CreateHeader(DocumentKind.Pdf, 1, publicKey, new byte[32], new byte[12]);
        var envelope = BinaryEnvelope.Assemble(header, new byte[1 + BinaryEnvelope.TagBytes]);
        envelope[offset] ^= 1;
        Assert.Throws<EnvelopeFormatException>(() => BinaryEnvelope.Parse(envelope));
    }

    [Fact]
    public void RejectsZeroLengthPlaintextLikeTheTypeScriptParser()
    {
        var publicKey = new byte[BinaryEnvelope.PublicKeyBytes];
        publicKey[0] = 0x04;

        Assert.Throws<EnvelopeFormatException>(() =>
            BinaryEnvelope.CreateHeader(DocumentKind.Pdf, 0, publicKey, new byte[32], new byte[12]));
    }

    [Fact]
    public void AadIncludesCanonicalContextAndEntireHeader()
    {
        var publicKey = new byte[65];
        publicKey[0] = 0x04;
        var header = BinaryEnvelope.CreateHeader(DocumentKind.Png, 1, publicKey, new byte[32], new byte[12]);
        var fingerprint = CanonicalEncoding.EncodeBase64Url(new byte[32]);
        var aad = BinaryEnvelope.BuildAad(new AadContext(1, Fixtures.TestDocuments.SessionId, fingerprint), header);

        Assert.Equal(header, aad[^header.Length..]);
        Assert.Equal(BinaryEnvelope.AadDomain.Length + 1 + 1 + 22 + 1 + 43 + 135, aad.Length);
    }
}
