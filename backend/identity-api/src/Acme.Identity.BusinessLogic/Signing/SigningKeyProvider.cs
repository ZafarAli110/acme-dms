using System.Security.Cryptography;
using Acme.Identity.BusinessLogic.Abstractions.Signing;
using Acme.Identity.Persistence.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.IdentityModel.Tokens;
using Acme.Identity.Persistence.Database;

namespace Acme.Identity.BusinessLogic.Signing;

/// <summary>
/// Loads the signing key from the identity database, creating one on first use, and keeps it in memory.
/// Singleton, so it resolves the (scoped) DbContext through a fresh scope instead of holding one.
/// </summary>
internal sealed class SigningKeyProvider : ISigningKeyProvider, IDisposable
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly TimeProvider _timeProvider;
    private readonly SemaphoreSlim _lock = new(1, 1);
    private RsaSecurityKey? _signingKey;

    public SigningKeyProvider(IServiceScopeFactory scopeFactory, TimeProvider timeProvider)
    {
        _scopeFactory = scopeFactory;
        _timeProvider = timeProvider;
    }

    public async Task<RsaSecurityKey> GetSigningKeyAsync(CancellationToken cancellationToken)
    {
        if (_signingKey is not null)
        {
            return _signingKey;
        }

        await _lock.WaitAsync(cancellationToken);
        try
        {
            _signingKey ??= await LoadOrCreateAsync(cancellationToken);
            return _signingKey;
        }
        finally
        {
            _lock.Release();
        }
    }

    public void Dispose() => _lock.Dispose();

    private async Task<RsaSecurityKey> LoadOrCreateAsync(CancellationToken cancellationToken)
    {
        using var scope = _scopeFactory.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<IdentityDbContext>();

        var stored = await dbContext.SigningKeys.OrderByDescending(k => k.CreatedAt).FirstOrDefaultAsync(cancellationToken);
        if (stored is null)
        {
            using var rsa = RSA.Create(2048);
            stored = new SigningKey
            {
                Id = Guid.NewGuid().ToString("N"),
                PrivateKeyPkcs8 = rsa.ExportPkcs8PrivateKey(),
                CreatedAt = _timeProvider.GetUtcNow(),
            };
            dbContext.SigningKeys.Add(stored);
            await dbContext.SaveChangesAsync(cancellationToken);
        }

        var key = RSA.Create();
        key.ImportPkcs8PrivateKey(stored.PrivateKeyPkcs8, out _);
        return new RsaSecurityKey(key) { KeyId = stored.Id };
    }
}
