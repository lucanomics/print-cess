using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Paradiso.PrintCess.Core.Crypto;
using Paradiso.PrintCess.Core.Documents;
using Paradiso.PrintCess.Core.Protocol;

namespace Paradiso.PrintCess.Tests.Crypto;

public sealed class KnownAnswerVectorTests
{
    [Fact]
    public void MatchesFrozenProtocolVersionOneVector()
    {
        var path = Path.Combine(AppContext.BaseDirectory, "Fixtures", "protocol-v1.json");
        Assert.True(File.Exists(path), $"Required TypeScript interoperability vector is missing: {path}");
        using var json = JsonDocument.Parse(File.ReadAllBytes(path));
        var vector = json.RootElement;
        var kioskPrivate = Hex(vector, "kioskPrivateScalarHex");
        var kioskPublic = Hex(vector, "kioskPublicKeyHex");
        var mobilePublic = Hex(vector, "mobilePublicKeyHex");
        var salt = Hex(vector, "saltHex");
        var iv = Hex(vector, "ivHex");
        var plaintext = Encoding.UTF8.GetBytes(vector.GetProperty("plaintextUtf8").GetString()!);
        var expectedHeader = Hex(vector, "headerHex");
        var ciphertext = Hex(vector, "ciphertextHex");
        var tag = Hex(vector, "tagHex");
        var expectedHash = Hex(vector, "envelopeSha256Hex");
        var expectedDerivedKey = Hex(vector, "derivedKeyHex");

        var header = BinaryEnvelope.CreateHeader(DocumentKind.Pdf, plaintext.Length, mobilePublic, salt, iv);
        var encryptedPayload = ciphertext.Concat(tag).ToArray();
        var envelope = BinaryEnvelope.Assemble(header, encryptedPayload);
        Assert.Equal(expectedHeader, header);
        Assert.Equal(expectedHash, SHA256.HashData(envelope));

        var derivedKey = new byte[32];
        HKDF.DeriveKey(
            HashAlgorithmName.SHA256,
            mobilePublic.AsSpan(1, 32),
            derivedKey,
            salt,
            Encoding.UTF8.GetBytes(BinaryEnvelope.HkdfInfo));
        Assert.Equal(expectedDerivedKey, derivedKey);

        using var key = KioskSessionKey.ImportForTest(kioskPrivate, kioskPublic);
        Assert.Equal(vector.GetProperty("kioskFingerprint").GetString(), key.PublicKeyFingerprint);
        var context = new AadContext(
            vector.GetProperty("protocolVersion").GetInt32(),
            vector.GetProperty("sessionId").GetString()!,
            vector.GetProperty("kioskFingerprint").GetString()!);
        using var decrypted = EncryptedDocumentDecryptor.Decrypt(envelope, context, key);
        Assert.Equal(plaintext, decrypted.Bytes);

        CryptographicOperations.ZeroMemory(kioskPrivate);
        CryptographicOperations.ZeroMemory(plaintext);
        CryptographicOperations.ZeroMemory(derivedKey);
    }

    private static byte[] Hex(JsonElement vector, string property) =>
        Convert.FromHexString(vector.GetProperty(property).GetString()!);
}
