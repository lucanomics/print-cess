using System.Security.Cryptography;
using System.Text;
using Paradiso.PrintCess.Core.Documents;
using Paradiso.PrintCess.Core.Protocol;

namespace Paradiso.PrintCess.Core.Crypto;

public static class EncryptedDocumentDecryptor
{
    private static readonly byte[] HkdfInfo = Encoding.UTF8.GetBytes(BinaryEnvelope.HkdfInfo);

    public static DecryptedDocument Decrypt(
        ReadOnlySpan<byte> envelopeBytes,
        AadContext context,
        KioskSessionKey kioskKey)
    {
        ArgumentNullException.ThrowIfNull(kioskKey);
        var envelope = BinaryEnvelope.Parse(envelopeBytes);
        var sharedSecret = Array.Empty<byte>();
        var aesKey = new byte[32];
        var aad = Array.Empty<byte>();
        var plaintext = new byte[envelope.PlaintextLength];

        try
        {
            sharedSecret = kioskKey.DeriveRawSecret(envelope.EphemeralPublicKey);
            HKDF.DeriveKey(HashAlgorithmName.SHA256, sharedSecret, aesKey, envelope.Salt, HkdfInfo);
            aad = BinaryEnvelope.BuildAad(context, envelope.Header);

            var ciphertextLength = envelope.CiphertextAndTag.Length - BinaryEnvelope.TagBytes;
            var ciphertext = envelope.CiphertextAndTag.AsSpan(0, ciphertextLength);
            var tag = envelope.CiphertextAndTag.AsSpan(ciphertextLength, BinaryEnvelope.TagBytes);
            using var aesGcm = new AesGcm(aesKey, BinaryEnvelope.TagBytes);
            aesGcm.Decrypt(envelope.Iv, ciphertext, tag, plaintext, aad);
            return new DecryptedDocument(envelope.FileKind, plaintext);
        }
        catch (Exception exception) when (exception is CryptographicException or ProtocolException)
        {
            CryptographicOperations.ZeroMemory(plaintext);
            throw new EnvelopeDecryptionException("Encrypted document authentication failed.", exception);
        }
        finally
        {
            if (sharedSecret.Length > 0)
            {
                CryptographicOperations.ZeroMemory(sharedSecret);
            }

            CryptographicOperations.ZeroMemory(aesKey);
            if (aad.Length > 0)
            {
                CryptographicOperations.ZeroMemory(aad);
            }
        }
    }
}

public sealed class DecryptedDocument : IDisposable
{
    private bool _disposed;

    internal DecryptedDocument(DocumentKind kind, byte[] bytes)
    {
        Kind = kind;
        Bytes = bytes;
    }

    public DocumentKind Kind { get; }

    public byte[] Bytes { get; }

    public void Dispose()
    {
        if (_disposed)
        {
            return;
        }

        _disposed = true;
        CryptographicOperations.ZeroMemory(Bytes);
    }
}

public sealed class EnvelopeDecryptionException : CryptographicException
{
    public EnvelopeDecryptionException(string message, Exception innerException)
        : base(message, innerException)
    {
    }
}
