using System.Security.Cryptography;
using Acme.Identity.BusinessLogic.Abstractions.Signing;
using Acme.Identity.BusinessLogic.Signing;
using Acme.Identity.Persistence.Database;
using Acme.Identity.Persistence.Entities;
using Acme.Identity.Tests.Support;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;

namespace Acme.Identity.Tests.Signing;

/// <summary>The signing keys: kept encrypted, published ahead, rotated, and kept while their tokens can live.</summary>
[TestClass]
public sealed class SigningKeyProviderTests
{
    public TestContext TestContext { get; set; } = null!;

    [TestMethod]
    public async Task GetSigningKeyAsync_MakesTheFirstKey_AndKeepsItsPrivateKeyEncrypted()
    {
        var keys = await KeysAsync();

        var signingKey = await keys.NewProvider().GetSigningKeyAsync(TestContext.CancellationToken);

        await using var dbContext = keys.NewDbContext();
        var stored = await dbContext.SigningKeys.SingleAsync(TestContext.CancellationToken);
        Assert.AreEqual(stored.Id, signingKey.KeyId);
        Assert.IsNull(stored.PrivateKeyPkcs8);
        using var rsa = RSA.Create();
        Assert.ThrowsExactly<CryptographicException>(() => rsa.ImportPkcs8PrivateKey(stored.ProtectedPrivateKey, out _), "a copy of the table is no key");
    }

    [TestMethod]
    public async Task GetSigningKeyAsync_EncryptsAKeyKeptUnencrypted_AndKeepsSigningWithIt()
    {
        var keys = await KeysAsync();
        using var rsa = RSA.Create(2048);
        await using (var dbContext = keys.NewDbContext())
        {
            dbContext.SigningKeys.Add(new SigningKey
            {
                Id = "from-before",
                PrivateKeyPkcs8 = rsa.ExportPkcs8PrivateKey(),
                CreatedAt = keys.Clock.GetUtcNow().AddDays(-1),
                ActivatesAt = keys.Clock.GetUtcNow().AddDays(-1),
            });
            await dbContext.SaveChangesAsync(TestContext.CancellationToken);
        }

        var signingKey = await keys.NewProvider().GetSigningKeyAsync(TestContext.CancellationToken);

        Assert.AreEqual("from-before", signingKey.KeyId);
        await using var check = keys.NewDbContext();
        var stored = await check.SigningKeys.SingleAsync(TestContext.CancellationToken);
        Assert.IsNull(stored.PrivateKeyPkcs8);
        Assert.IsNotNull(stored.ProtectedPrivateKey);
    }

    [TestMethod]
    public async Task GetPublishedKeysAsync_PublishesTheNextKeyAhead_SwitchesOnTime_AndDropsTheOldOneOnceItsTokensAreGone()
    {
        var keys = await KeysAsync();
        var first = await keys.NewProvider().GetSigningKeyAsync(TestContext.CancellationToken);

        // An hour before the rotation is due, the next key is made and published, but does not sign yet.
        keys.Clock.Advance(TokenSettings.SigningKeyRotateEvery - TokenSettings.SigningKeyPublishedAhead);
        var provider = keys.NewProvider();
        var published = await provider.GetPublishedKeysAsync(TestContext.CancellationToken);
        Assert.HasCount(2, published);
        Assert.AreEqual(first.KeyId, (await provider.GetSigningKeyAsync(TestContext.CancellationToken)).KeyId);
        var next = published.Single(key => key.KeyId != first.KeyId);

        // When its time comes, the next key signs; the first stays published while a token it signed can live.
        keys.Clock.Advance(TokenSettings.SigningKeyPublishedAhead);
        Assert.AreEqual(next.KeyId, (await provider.GetSigningKeyAsync(TestContext.CancellationToken)).KeyId);
        Assert.HasCount(2, await keys.NewProvider().GetPublishedKeysAsync(TestContext.CancellationToken));

        keys.Clock.Advance(TokenSettings.SigningKeyKeptAfter);
        var afterwards = await keys.NewProvider().GetPublishedKeysAsync(TestContext.CancellationToken);
        Assert.AreEqual(next.KeyId, afterwards.Single().KeyId);
    }

    [TestMethod]
    public async Task GetSigningKeyAsync_TwoInstancesDueToRotateAtOnce_MakeOneNextKey()
    {
        var keys = await KeysAsync();
        await keys.NewProvider().GetSigningKeyAsync(TestContext.CancellationToken);
        keys.Clock.Advance(TokenSettings.SigningKeyRotateEvery);

        await Task.WhenAll(
            keys.NewProvider().GetPublishedKeysAsync(TestContext.CancellationToken),
            keys.NewProvider().GetPublishedKeysAsync(TestContext.CancellationToken));

        await using var dbContext = keys.NewDbContext();
        Assert.AreEqual(2, await dbContext.SigningKeys.CountAsync(TestContext.CancellationToken));
    }

    [TestMethod]
    public async Task GetSigningKeyAsync_ReplacesAKeyThatCanNoLongerBeOpened_InsteadOfFailing()
    {
        var keys = await KeysAsync();
        var lost = await keys.NewProvider().GetSigningKeyAsync(TestContext.CancellationToken);

        // Data Protection's keys are gone (a new machine, a deleted folder): the stored key can no longer be opened.
        keys.DataProtection = new EphemeralDataProtectionProvider();
        var signingKey = await keys.NewProvider().GetSigningKeyAsync(TestContext.CancellationToken);

        Assert.AreNotEqual(lost.KeyId, signingKey.KeyId);
        await using var dbContext = keys.NewDbContext();
        Assert.AreEqual(signingKey.KeyId, (await dbContext.SigningKeys.SingleAsync(TestContext.CancellationToken)).Id);
    }

    private async Task<Keys> KeysAsync() => new(await TestPostgres.NewDatabaseAsync(TestContext.CancellationToken));

    /// <summary>One identity database, a clock the test moves, and the Data Protection keys every provider shares.</summary>
    private sealed class Keys(DbContextOptions<IdentityDbContext> options)
    {
        /// <summary>Data Protection's keys, shared by the providers; replace it to lose them.</summary>
        public IDataProtectionProvider DataProtection { get; set; } = new EphemeralDataProtectionProvider();

        public TestClock Clock { get; } = new();

        public IdentityDbContext NewDbContext() => new(options);

        /// <summary>A provider with nothing in memory yet: what a freshly started identity-api instance has.</summary>
        public SigningKeyProvider NewProvider()
        {
            var services = new ServiceCollection();
            services.AddScoped(_ => new IdentityDbContext(options));
            return new SigningKeyProvider(
                services.BuildServiceProvider().GetRequiredService<IServiceScopeFactory>(),
                Clock,
                DataProtection,
                NullLogger<SigningKeyProvider>.Instance);
        }
    }

    private sealed class TestClock : TimeProvider
    {
        private DateTimeOffset _now = DateTimeOffset.UtcNow;

        public override DateTimeOffset GetUtcNow() => _now;

        public void Advance(TimeSpan by) => _now += by;
    }
}
