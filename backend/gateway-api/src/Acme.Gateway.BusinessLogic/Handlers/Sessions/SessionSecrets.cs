using System.Buffers.Text;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace Acme.Gateway.BusinessLogic.Handlers.Sessions;

/// <summary>
/// What is derived from a session cookie's value, which is 256 random bits. The gateway stores only its SHA-256 (the row's id)
/// and encrypts the session's tokens with a key derived from the value (HKDF, then AES-GCM), so a copy of the sessions table
/// holds no token anyone can use: only the browser that has the cookie can open its own row.
/// </summary>
internal static class SessionSecrets
{
    private static readonly byte[] _keyInfo = Encoding.UTF8.GetBytes("acme-gateway-session-tokens");
    private const int NonceSize = 12;
    private const int TagSize = 16;

    /// <summary>A new cookie value: 256 random bits, URL-safe.</summary>
    public static string NewValue() => Base64Url.EncodeToString(RandomNumberGenerator.GetBytes(32));

    /// <summary>The row's id: the SHA-256 of the value, in hex.</summary>
    public static string IdOf(string value) => Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(value)));

    /// <summary>The tokens, encrypted with the key only this value gives: nonce, then ciphertext, then tag.</summary>
    public static byte[] Seal(string value, SessionTokens tokens)
    {
        var plain = JsonSerializer.SerializeToUtf8Bytes(tokens);
        var sealedBytes = new byte[NonceSize + plain.Length + TagSize];
        var nonce = sealedBytes.AsSpan(0, NonceSize);
        RandomNumberGenerator.Fill(nonce);
        using var aes = new AesGcm(KeyOf(value), TagSize);
        aes.Encrypt(nonce, plain, sealedBytes.AsSpan(NonceSize, plain.Length), sealedBytes.AsSpan(NonceSize + plain.Length));
        return sealedBytes;
    }

    /// <summary>The tokens <see cref="Seal"/> encrypted; null when this value did not seal them.</summary>
    public static SessionTokens? Open(string value, byte[] sealedBytes)
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
            using var aes = new AesGcm(KeyOf(value), TagSize);
            aes.Decrypt(sealedBytes.AsSpan(0, NonceSize), sealedBytes.AsSpan(NonceSize, length), sealedBytes.AsSpan(NonceSize + length), plain);
        }
        catch (AuthenticationTagMismatchException)
        {
            return null;
        }

        return JsonSerializer.Deserialize<SessionTokens>(plain);
    }

    private static byte[] KeyOf(string value) =>
        HKDF.DeriveKey(HashAlgorithmName.SHA256, Encoding.UTF8.GetBytes(value), 32, salt: [], info: _keyInfo);
}
