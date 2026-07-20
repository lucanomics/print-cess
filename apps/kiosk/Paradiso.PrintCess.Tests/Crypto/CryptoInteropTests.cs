using System.Security.Cryptography;
using System.Text;
using Paradiso.PrintCess.Core.Crypto;
using Paradiso.PrintCess.Core.Documents;
using Paradiso.PrintCess.Core.Protocol;
using Paradiso.PrintCess.Tests.Fixtures;

namespace Paradiso.PrintCess.Tests.Crypto;

public sealed class CryptoInteropTests
{
    private static readonly byte[] Plaintext = Encoding.UTF8.GetBytes("SYNTHETIC TEST DOCUMENT — NOT VALID");

    [Fact]
    public void RoundTripsRawEcdhHkdfAndAesGcm()
    {
        using var kiosk = KioskSessionKey.Generate();
        var context = ContextFor(kiosk);
        var envelope = EncryptForKiosk(kiosk.PublicKey, Plaintext, DocumentKind.Pdf, context);

        using var decrypted = EncryptedDocumentDecryptor.Decrypt(envelope, context, kiosk);

        Assert.Equal(DocumentKind.Pdf, decrypted.Kind);
        Assert.Equal(Plaintext, decrypted.Bytes);
    }

    [Theory]
    [InlineData(30)]
    [InlineData(95)]
    [InlineData(128)]
    [InlineData(-17)]
    [InlineData(-1)]
    public void AuthenticationRejectsChangedEnvelopeByte(int index)
    {
        using var kiosk = KioskSessionKey.Generate();
        var context = ContextFor(kiosk);
        var envelope = EncryptForKiosk(kiosk.PublicKey, Plaintext, DocumentKind.Pdf, context);
        var actualIndex = index < 0 ? envelope.Length + index : index;
        envelope[actualIndex] ^= 1;

        Assert.Throws<EnvelopeDecryptionException>(() =>
            EncryptedDocumentDecryptor.Decrypt(envelope, context, kiosk));
    }

    [Fact]
    public void AuthenticationRejectsSessionAndFingerprintMismatch()
    {
        using var kiosk = KioskSessionKey.Generate();
        var context = ContextFor(kiosk);
        var envelope = EncryptForKiosk(kiosk.PublicKey, Plaintext, DocumentKind.Pdf, context);
        var otherSession = CanonicalEncoding.EncodeBase64Url(Enumerable.Repeat((byte)0x7f, 16).ToArray());
        var otherFingerprint = CanonicalEncoding.EncodeBase64Url(Enumerable.Repeat((byte)0x55, 32).ToArray());

        Assert.Throws<EnvelopeDecryptionException>(() => EncryptedDocumentDecryptor.Decrypt(
            envelope,
            context with { SessionId = otherSession },
            kiosk));
        Assert.Throws<EnvelopeDecryptionException>(() => EncryptedDocumentDecryptor.Decrypt(
            envelope,
            context with { KioskPublicKeyFingerprint = otherFingerprint },
            kiosk));
    }

    private static AadContext ContextFor(KioskSessionKey key) =>
        new(1, TestDocuments.SessionId, key.PublicKeyFingerprint);

    private static byte[] EncryptForKiosk(
        byte[] kioskPublicKey,
        byte[] plaintext,
        DocumentKind kind,
        AadContext context)
    {
        using var mobile = ECDiffieHellman.Create(ECCurve.NamedCurves.nistP256);
        using var kiosk = ImportPublicKey(kioskPublicKey);
        var shared = mobile.DeriveRawSecretAgreement(kiosk.PublicKey);
        var mobileParameters = mobile.ExportParameters(false);
        var mobilePublicKey = new byte[65];
        mobilePublicKey[0] = 0x04;
        mobileParameters.Q.X!.CopyTo(mobilePublicKey, 1);
        mobileParameters.Q.Y!.CopyTo(mobilePublicKey, 33);
        var salt = Enumerable.Range(0, 32).Select(static value => (byte)value).ToArray();
        var iv = Enumerable.Range(0, 12).Select(static value => (byte)(0xa0 + value)).ToArray();
        var key = new byte[32];
        HKDF.DeriveKey(HashAlgorithmName.SHA256, shared, key, salt, Encoding.UTF8.GetBytes(BinaryEnvelope.HkdfInfo));
        var header = BinaryEnvelope.CreateHeader(kind, plaintext.Length, mobilePublicKey, salt, iv);
        var aad = BinaryEnvelope.BuildAad(context, header);
        var ciphertext = new byte[plaintext.Length];
        var tag = new byte[16];
        using (var aes = new AesGcm(key, 16))
        {
            aes.Encrypt(iv, plaintext, ciphertext, tag, aad);
        }

        var combined = new byte[ciphertext.Length + tag.Length];
        ciphertext.CopyTo(combined, 0);
        tag.CopyTo(combined, ciphertext.Length);
        CryptographicOperations.ZeroMemory(shared);
        CryptographicOperations.ZeroMemory(key);
        return BinaryEnvelope.Assemble(header, combined);
    }

    private static ECDiffieHellman ImportPublicKey(byte[] raw) => ECDiffieHellman.Create(new ECParameters
    {
        Curve = ECCurve.NamedCurves.nistP256,
        Q = new ECPoint
        {
            X = raw.AsSpan(1, 32).ToArray(),
            Y = raw.AsSpan(33, 32).ToArray(),
        },
    });

}
