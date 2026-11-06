using System.Buffers.Text;
using System.Security.Cryptography;
using System.Text;

namespace Acme.Identity.BusinessLogic.Handlers.Tokens;

/// <summary>A refresh token is 256 random bits. The service keeps only its SHA-256, so the table cannot sign anyone in.</summary>
internal static class RefreshTokenSecret
{
    /// <summary>A new token, for the person; keep <see cref="Hash"/> of it, never it.</summary>
    public static string Create() => Base64Url.EncodeToString(RandomNumberGenerator.GetBytes(32));

    public static string Hash(string token) => Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(token)));
}
