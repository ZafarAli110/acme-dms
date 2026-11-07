using System.Buffers.Text;
using System.Security.Cryptography;
using System.Text;

namespace Acme.Identity.BusinessLogic.Handlers.Tokens;

/// <summary>
/// A refresh token is 256 random bits. The service keeps only its SHA-256, so the table cannot sign anyone in. The token that
/// replaces one is kept too, sealed with a key only the replaced token gives (HKDF, then AES-GCM): whoever still holds the
/// replaced token, inside the grace period, can be given its replacement again, and nobody else can read it.
/// </summary>
internal static class RefreshTokenSecret
{
    private static readonly byte[] _keyInfo = Encoding.UTF8.GetBytes("acme-identity-next-refresh-token");
    private const int NonceSize = 12;
    private const int TagSize = 16;

    /// <summary>A new token, for the person; keep <see cref="Hash"/> of it, never it.</summary>
    public static string Create() => Base64Url.EncodeToString(RandomNumberGenerator.GetBytes(32));

    public static string Hash(string token) => Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(token)));

    /// <summary>The token that replaced <paramref name="replaced"/>, sealed with a key derived from it: nonce, ciphertext, tag.</summary>
    public static byte[] SealNext(string replaced, string next)
    {
        var plain = Encoding.UTF8.GetBytes(next);
        var sealedBytes = new byte[NonceSize + plain.Length + TagSize];
        var nonce = sealedBytes.AsSpan(0, NonceSize);
        RandomNumberGenerator.Fill(nonce);
        using var aes = new AesGcm(KeyOf(replaced), TagSize);
        aes.Encrypt(nonce, plain, sealedBytes.AsSpan(NonceSize, plain.Length), sealedBytes.AsSpan(NonceSize + plain.Length));
        return sealedBytes;
    }

    /// <summary>The token <see cref="SealNext"/> sealed; null when <paramref name="replaced"/> did not seal it.</summary>
    public static string? OpenNext(string replaced, byte[] sealedBytes)
    {
        ArgumentNullException.ThrowIfNull(sealedBytes);
        if (sealedBytes.Length < NonceSize + TagSize)
        {
            return null;
        }

        var length = sealedBytes.Length - NonceSize - TagSize;
        var plain = new byte[length];
        try
        {
            using var aes = new AesGcm(KeyOf(replaced), TagSize);
            aes.Decrypt(sealedBytes.AsSpan(0, NonceSize), sealedBytes.AsSpan(NonceSize, length), sealedBytes.AsSpan(NonceSize + length), plain);
        }
        catch (AuthenticationTagMismatchException)
        {
            return null;
        }

        return Encoding.UTF8.GetString(plain);
    }

    private static byte[] KeyOf(string token) =>
        HKDF.DeriveKey(HashAlgorithmName.SHA256, Encoding.UTF8.GetBytes(token), 32, salt: [], info: _keyInfo);
}
