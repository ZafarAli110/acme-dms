using System.Collections.Concurrent;
using System.Security.Cryptography;
using Acme.Identity.BusinessLogic.Abstractions.Signing;
using Acme.Identity.Persistence.Database;
using Acme.Identity.Persistence.Entities;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.IdentityModel.Tokens;

namespace Acme.Identity.BusinessLogic.Signing;

/// <summary>
/// The signing keys, from the identity database, kept in memory and looked at again every few minutes. Each look keeps the
/// ring turning, on whichever identity-api instance gets there first (a Postgres advisory lock lets one at a time):
/// <list type="bullet">
/// <item>the first key is made when there is none;</item>
/// <item>a key that has signed for almost <see cref="TokenSettings.SigningKeyRotateEvery"/> gets its successor, published
/// <see cref="TokenSettings.SigningKeyPublishedAhead"/> before it takes over;</item>
/// <item>a key whose successor took over more than <see cref="TokenSettings.SigningKeyKeptAfter"/> ago is deleted: no token
/// it signed can still be shown;</item>
/// <item>a key still kept unencrypted (from before keys were protected) is encrypted.</item>
/// </list>
/// Private keys are kept encrypted with ASP.NET Data Protection, whose keys live outside this database (see Program.cs), so
/// a copy of the database cannot sign a token. Singleton, so it resolves the (scoped) DbContext through a fresh scope.
/// </summary>
internal sealed partial class SigningKeyProvider : ISigningKeyProvider, IDisposable
{
    /// <summary>How often the keys are read again: a rotation another instance made is seen within this.</summary>
    private static readonly TimeSpan _lookAgainEvery = TimeSpan.FromMinutes(5);

    /// <summary>The advisory lock that lets one identity-api instance at a time change the keys.</summary>
    private const long KeysLock = 0x4163_6D65_4B65_7973;

    private readonly IServiceScopeFactory _scopeFactory;
    private readonly TimeProvider _timeProvider;
    private readonly IDataProtector _protector;
    private readonly ILogger<SigningKeyProvider> _logger;
    private readonly SemaphoreSlim _lock = new(1, 1);
    private readonly ConcurrentDictionary<string, RsaSecurityKey> _opened = new();
    private KeyRing? _ring;

    public SigningKeyProvider(
        IServiceScopeFactory scopeFactory,
        TimeProvider timeProvider,
        IDataProtectionProvider dataProtection,
        ILogger<SigningKeyProvider> logger)
    {
        ArgumentNullException.ThrowIfNull(dataProtection);
        _scopeFactory = scopeFactory;
        _timeProvider = timeProvider;
        _protector = dataProtection.CreateProtector("Acme.Identity.SigningKeys");
        _logger = logger;
    }

    public async Task<RsaSecurityKey> GetSigningKeyAsync(CancellationToken cancellationToken) =>
        (await RingAsync(cancellationToken)).Active;

    public async Task<IReadOnlyList<RsaSecurityKey>> GetPublishedKeysAsync(CancellationToken cancellationToken) =>
        (await RingAsync(cancellationToken)).Published;

    public void Dispose() => _lock.Dispose();

    private async Task<KeyRing> RingAsync(CancellationToken cancellationToken)
    {
        if (IsCurrent(_ring, _timeProvider.GetUtcNow()) is { } current)
        {
            return current;
        }

        await _lock.WaitAsync(cancellationToken);
        try
        {
            var now = _timeProvider.GetUtcNow();
            _ring = IsCurrent(_ring, now) ?? await LoadAsync(now, cancellationToken);
            return _ring;
        }
        finally
        {
            _lock.Release();
        }
    }

    /// <summary>The ring, while it is recent and its active key has not been overtaken by the next one.</summary>
    private static KeyRing? IsCurrent(KeyRing? ring, DateTimeOffset now) =>
        ring is not null && ring.LoadedAt + _lookAgainEvery > now && ring.ActiveUntil > now ? ring : null;

    private async Task<KeyRing> LoadAsync(DateTimeOffset now, CancellationToken cancellationToken)
    {
        using var scope = _scopeFactory.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<IdentityDbContext>();
        await using var transaction = await dbContext.Database.BeginTransactionAsync(cancellationToken);
        await dbContext.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock({KeysLock})", cancellationToken);

        var keys = await dbContext.SigningKeys.OrderBy(k => k.ActivatesAt).ToListAsync(cancellationToken);
        foreach (var unprotected in keys.Where(k => k.ProtectedPrivateKey is null && k.PrivateKeyPkcs8 is not null))
        {
            unprotected.ProtectedPrivateKey = _protector.Protect(unprotected.PrivateKeyPkcs8!);
            unprotected.PrivateKeyPkcs8 = null;
        }

        // A key Data Protection can no longer open (its keys were lost or replaced) can sign nothing: it goes, and the ring
        // goes on without it. Tokens it signed stop verifying, and the gateway renews them with the key that signs now.
        foreach (var lost in keys.Where(k => !CanOpen(k)).ToList())
        {
            LogKeyCannotBeOpened(_logger, lost.Id);
            dbContext.SigningKeys.Remove(lost);
            keys.Remove(lost);
        }

        var active = keys.LastOrDefault(k => k.ActivatesAt <= now);
        if (active is null)
        {
            active = NewKey(now, now);
            dbContext.SigningKeys.Add(active);
            keys.Insert(0, active);
        }

        var next = keys.FirstOrDefault(k => k.ActivatesAt > now);
        if (next is null && active.ActivatesAt + TokenSettings.SigningKeyRotateEvery - TokenSettings.SigningKeyPublishedAhead <= now)
        {
            next = NewKey(now, now + TokenSettings.SigningKeyPublishedAhead);
            dbContext.SigningKeys.Add(next);
            keys.Add(next);
        }

        // A key is retired once the key after it has signed for longer than any token can live.
        var retired = keys
            .Where((key, index) => key.ActivatesAt < active.ActivatesAt
                && keys[index + 1].ActivatesAt + TokenSettings.SigningKeyKeptAfter <= now)
            .ToList();
        dbContext.SigningKeys.RemoveRange(retired);

        await dbContext.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);

        var published = keys.Except(retired).Select(Open).ToList();
        return new KeyRing(Open(active), published, now, next?.ActivatesAt ?? DateTimeOffset.MaxValue);
    }

    private SigningKey NewKey(DateTimeOffset now, DateTimeOffset activatesAt)
    {
        using var rsa = RSA.Create(2048);
        return new SigningKey
        {
            Id = Guid.NewGuid().ToString("N"),
            ProtectedPrivateKey = _protector.Protect(rsa.ExportPkcs8PrivateKey()),
            CreatedAt = now,
            ActivatesAt = activatesAt,
        };
    }

    private bool CanOpen(SigningKey key)
    {
        try
        {
            Open(key);
            return true;
        }
        catch (CryptographicException)
        {
            return false;
        }
    }

    [LoggerMessage(Level = LogLevel.Warning, Message = "Signing key {KeyId} cannot be opened with this Data Protection key ring; it is deleted and a new key signs")]
    private static partial void LogKeyCannotBeOpened(ILogger logger, string keyId);

    /// <summary>The key as tokens are signed and checked with it; each is opened once and kept.</summary>
    private RsaSecurityKey Open(SigningKey key) =>
        _opened.GetOrAdd(key.Id, id =>
        {
            var rsa = RSA.Create();
            rsa.ImportPkcs8PrivateKey(_protector.Unprotect(key.ProtectedPrivateKey!), out _);
            return new RsaSecurityKey(rsa) { KeyId = id };
        });

    /// <summary>What was read: the key signing now, every key a token may be checked with, and until when that holds.</summary>
    private sealed record KeyRing(RsaSecurityKey Active, IReadOnlyList<RsaSecurityKey> Published, DateTimeOffset LoadedAt, DateTimeOffset ActiveUntil);
}
