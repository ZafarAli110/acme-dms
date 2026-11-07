using System.Collections.Concurrent;
using System.Security.Cryptography;
using Acme.Identity.BusinessLogic.Abstractions.Signing;
using Acme.Identity.Persistence.Database;
using Acme.Identity.Persistence.Entities;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
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
/// Every key is published from its public half, kept beside it, so an instance whose Data Protection keys cannot open a
/// key still publishes it. Such a key is never deleted outside Development: two instances with different Data Protection
/// keys would delete each other's keys, and every token either signed would stop verifying. It is logged as an error, and
/// retires by age like any other; while it is the key that signs, this instance cannot sign. In Development a key that
/// cannot be opened (a developer's Data Protection folder deleted) is replaced, so a sign-in still works.
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
    private readonly bool _replaceKeysItCannotOpen;
    private readonly SemaphoreSlim _lock = new(1, 1);
    private readonly ConcurrentDictionary<string, RsaSecurityKey> _opened = new();
    private readonly ConcurrentDictionary<string, RsaSecurityKey> _public = new();
    private KeyRing? _ring;

    public SigningKeyProvider(
        IServiceScopeFactory scopeFactory,
        TimeProvider timeProvider,
        IDataProtectionProvider dataProtection,
        IHostEnvironment environment,
        ILogger<SigningKeyProvider> logger)
    {
        ArgumentNullException.ThrowIfNull(dataProtection);
        ArgumentNullException.ThrowIfNull(environment);
        _replaceKeysItCannotOpen = environment.IsDevelopment();
        _scopeFactory = scopeFactory;
        _timeProvider = timeProvider;
        _protector = dataProtection.CreateProtector("Acme.Identity.SigningKeys");
        _logger = logger;
    }

    public async Task<RsaSecurityKey> GetSigningKeyAsync(CancellationToken cancellationToken) =>
        (await RingAsync(cancellationToken)).Active
        ?? throw new InvalidOperationException(
            "identity-api cannot open the signing key in use: its Data Protection keys (DataProtection__KeysPath) are not the ones the key was made with.");

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

        foreach (var key in keys.Where(k => !CanOpen(k)).ToList())
        {
            if (_replaceKeysItCannotOpen)
            {
                LogKeyReplaced(_logger, key.Id);
                dbContext.SigningKeys.Remove(key);
                keys.Remove(key);
            }
            else
            {
                LogKeyCannotBeOpened(_logger, key.Id);
            }
        }

        foreach (var key in keys.Where(k => k.PublicKeySpki is null && CanOpen(k)))
        {
            key.PublicKeySpki = Open(key).Rsa.ExportSubjectPublicKeyInfo();
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

        var published = keys.Except(retired).Where(k => k.PublicKeySpki is not null).Select(Public).ToList();
        return new KeyRing(CanOpen(active) ? Open(active) : null, published, now, next?.ActivatesAt ?? DateTimeOffset.MaxValue);
    }

    private SigningKey NewKey(DateTimeOffset now, DateTimeOffset activatesAt)
    {
        using var rsa = RSA.Create(2048);
        return new SigningKey
        {
            Id = Guid.NewGuid().ToString("N"),
            ProtectedPrivateKey = _protector.Protect(rsa.ExportPkcs8PrivateKey()),
            PublicKeySpki = rsa.ExportSubjectPublicKeyInfo(),
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

    [LoggerMessage(Level = LogLevel.Error, Message = "Signing key {KeyId} cannot be opened with this instance's Data Protection keys; it is kept and still published. Check DataProtection__KeysPath: every identity-api instance must share it")]
    private static partial void LogKeyCannotBeOpened(ILogger logger, string keyId);

    [LoggerMessage(Level = LogLevel.Warning, Message = "Signing key {KeyId} cannot be opened with this Data Protection key ring; in Development it is deleted and a new key signs")]
    private static partial void LogKeyReplaced(ILogger logger, string keyId);

    /// <summary>The key as tokens are signed and checked with it; each is opened once and kept.</summary>
    private RsaSecurityKey Open(SigningKey key) =>
        _opened.GetOrAdd(key.Id, id =>
        {
            var rsa = RSA.Create();
            rsa.ImportPkcs8PrivateKey(_protector.Unprotect(key.ProtectedPrivateKey!), out _);
            return new RsaSecurityKey(rsa) { KeyId = id };
        });

    /// <summary>A key's public half, as tokens are checked with it; read once and kept.</summary>
    private RsaSecurityKey Public(SigningKey key) =>
        _public.GetOrAdd(key.Id, id =>
        {
            var rsa = RSA.Create();
            rsa.ImportSubjectPublicKeyInfo(key.PublicKeySpki!, out _);
            return new RsaSecurityKey(rsa) { KeyId = id };
        });

    /// <summary>
    /// What was read: the key signing now (null when this instance cannot open it), every key a token may be checked with,
    /// and until when that holds.
    /// </summary>
    private sealed record KeyRing(RsaSecurityKey? Active, IReadOnlyList<RsaSecurityKey> Published, DateTimeOffset LoadedAt, DateTimeOffset ActiveUntil);
}
