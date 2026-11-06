using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.WebUtilities;

namespace Acme.Gateway.Sessions;

/// <summary>The tokens a session keeps, sealed together.</summary>
internal sealed record SessionTokens(string AccessToken, string RefreshToken);

/// <summary>
/// The browser's session cookie, and what is derived from it. Its value is 256 random bits. The gateway stores only its SHA-256
/// (<see cref="Session.Id"/>) and encrypts the session's tokens with a key derived from the value (HKDF, then AES-GCM), so a copy
/// of the sessions table holds no token anyone can use: only the browser that has the cookie can open its own row.
/// </summary>
internal static class SessionCookie
{
    public const string Name = "acme_session";

    /// <summary>Sent with every call to the services, and only there: the page itself is not behind it.</summary>
    public const string Path = "/api";

    /// <summary>
    /// A page's own request carries this header, which a form or a link from another site cannot add: with
    /// <c>SameSite=Strict</c>, the defence against a request made on the person's behalf (the same one identity-api asks for).
    /// </summary>
    public const string RequiredHeader = "X-Requested-With";
    public const string RequiredHeaderValue = "acme-web";

    private static readonly byte[] _keyInfo = Encoding.UTF8.GetBytes("acme-gateway-session-tokens");
    private const int NonceSize = 12;
    private const int TagSize = 16;

    /// <summary>A new cookie value: 256 random bits, URL-safe.</summary>
    public static string NewValue() => WebEncoders.Base64UrlEncode(RandomNumberGenerator.GetBytes(32));

    /// <summary>The row's key: the SHA-256 of the value, in hex.</summary>
    public static string IdOf(string value) => Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(value)));

    /// <summary>The tokens, encrypted with the key only this cookie value gives: nonce, then ciphertext, then tag.</summary>
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

    public static void Set(HttpResponse response, IHostEnvironment environment, string value) =>
        response.Cookies.Append(Name, value, Options(environment));

    public static void Clear(HttpResponse response, IHostEnvironment environment) =>
        response.Cookies.Delete(Name, Options(environment));

    /// <summary>True when the request carries the header only the page itself adds.</summary>
    public static bool IsFromThePage(HttpRequest request) =>
        string.Equals(request.Headers[RequiredHeader], RequiredHeaderValue, StringComparison.Ordinal);

    private static byte[] KeyOf(string value) =>
        HKDF.DeriveKey(HashAlgorithmName.SHA256, Encoding.UTF8.GetBytes(value), 32, salt: [], info: _keyInfo);

    /// <summary>
    /// Out of reach of the page's scripts (<c>HttpOnly</c>), sent only from this site (<c>SameSite=Strict</c>) and only to
    /// <c>/api</c>, and gone when the browser closes (no expiry: the session's own lifetime is kept here).
    /// <c>Secure</c> everywhere but local development, which is plain HTTP.
    /// </summary>
    private static CookieOptions Options(IHostEnvironment environment) => new()
    {
        HttpOnly = true,
        Secure = !environment.IsDevelopment(),
        SameSite = SameSiteMode.Strict,
        Path = Path,
        IsEssential = true,
    };
}
