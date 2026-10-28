namespace Acme.Identity.Persistence.Entities;

public sealed class SigningKey
{
    public string Id { get; set; } = string.Empty;

    public byte[] PrivateKeyPkcs8 { get; set; } = [];

    public DateTimeOffset CreatedAt { get; set; }
}
