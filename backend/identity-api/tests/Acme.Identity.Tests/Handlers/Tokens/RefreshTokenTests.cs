using System.Data.Common;
using System.Security.Cryptography;
using Acme.Identity.BusinessLogic.Abstractions.Exceptions;
using Acme.Identity.BusinessLogic.Abstractions.Handlers.Tokens;
using Acme.Identity.BusinessLogic.Abstractions.Signing;
using Acme.Identity.BusinessLogic.Handlers.Tokens;
using Acme.Identity.BusinessLogic.Handlers.Tokens.Create;
using Acme.Identity.BusinessLogic.Handlers.Tokens.Refresh;
using Acme.Identity.BusinessLogic.Handlers.Tokens.Revoke;
using Acme.Identity.BusinessLogic.Seeding;
using Acme.Identity.DTO.Tokens;
using Acme.Identity.Persistence.Database;
using Acme.Identity.Persistence.Entities;
using Acme.Identity.Tests.Support;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;
using Moq;
using Npgsql;

namespace Acme.Identity.Tests.Handlers.Tokens;

/// <summary>
/// Signing in gives a short access token and a refresh token; the refresh token is the only way to a new one, and every
/// use replaces it. A replaced token shown again ends the sign-in.
/// </summary>
[TestClass]
public sealed class RefreshTokenTests
{
    private static readonly RsaSecurityKey _signingKey = new(RSA.Create(2048)) { KeyId = "test" };

    public TestContext TestContext { get; set; } = null!;

    [TestMethod]
    public async Task SignIn_GivesAShortAccessTokenAndKeepsOnlyTheHashOfTheRefreshToken()
    {
        await using var dbContext = await DemoDatabase.CreateAsync(TestContext.CancellationToken);
        var clock = new TestClock();

        var signedIn = await SignInAsync(dbContext, clock);

        var access = new JsonWebToken(signedIn.Response.AccessToken);
        Assert.AreEqual(15 * 60, signedIn.Response.ExpiresIn);
        Assert.AreEqual(TimeSpan.FromMinutes(15), access.ValidTo - access.ValidFrom);
        var stored = await dbContext.RefreshTokens.SingleAsync(TestContext.CancellationToken);
        Assert.AreEqual(RefreshTokenSecret.Hash(signedIn.RefreshToken!), stored.TokenHash);
        Assert.AreNotEqual(signedIn.RefreshToken, stored.TokenHash);
        Assert.AreEqual(TimeSpan.FromHours(8), stored.ExpiresAt - stored.CreatedAt);
        // The sign-in's id is in every access token it makes.
        Assert.AreEqual(stored.FamilyId.ToString(), access.GetClaim("sid").Value);
    }

    [TestMethod]
    public async Task Refresh_GivesANewAccessTokenAndANewRefreshToken_ForTheSameSignIn()
    {
        await using var dbContext = await DemoDatabase.CreateAsync(TestContext.CancellationToken);
        var clock = new TestClock();
        var signedIn = await SignInAsync(dbContext, clock);
        clock.Advance(TimeSpan.FromMinutes(14));

        var refreshed = await Refresh(dbContext, clock).ExecuteAsync(signedIn.RefreshToken!, TestContext.CancellationToken);

        var before = new JsonWebToken(signedIn.Response.AccessToken);
        var after = new JsonWebToken(refreshed.Response.AccessToken);
        Assert.AreEqual(before.GetClaim("sid").Value, after.GetClaim("sid").Value);
        Assert.AreEqual("rita@northwind.test", after.GetClaim("email").Value);
        Assert.HasCount(2, after.Claims.Where(c => c.Type == "locations"));
        Assert.AreNotEqual(signedIn.RefreshToken, refreshed.RefreshToken);
        // The sign-in still ends when it was going to, however often it is renewed.
        var chain = await dbContext.RefreshTokens.AsNoTracking().OrderBy(t => t.CreatedAt).ToListAsync(TestContext.CancellationToken);
        Assert.HasCount(2, chain);
        Assert.AreEqual(chain[0].ExpiresAt, chain[1].ExpiresAt);
        Assert.IsNotNull(chain[0].RotatedAt);
        Assert.IsNull(chain[1].RotatedAt);
    }

    [TestMethod]
    public async Task Refresh_ReadsTheLocationsAgain_SoAChangeTakesEffectWithinTheTokenLifetime()
    {
        await using var dbContext = await DemoDatabase.CreateAsync(TestContext.CancellationToken);
        var clock = new TestClock();
        var signedIn = await SignInAsync(dbContext, clock);
        await dbContext.UserLocationRoles
            .Where(r => r.LocationId == DemoData.Westgate)
            .ExecuteUpdateAsync(set => set
                .SetProperty(r => r.IsDeleted, true)
                .SetProperty(r => r.DeletedAt, DateTimeOffset.UtcNow)
                .SetProperty(r => r.DeletedBy, Guid.NewGuid()), TestContext.CancellationToken);

        var refreshed = await Refresh(dbContext, clock).ExecuteAsync(signedIn.RefreshToken!, TestContext.CancellationToken);

        var locations = new JsonWebToken(refreshed.Response.AccessToken).Claims.Where(c => c.Type == "locations").Select(c => c.Value).ToList();
        Assert.HasCount(1, locations);
        Assert.IsFalse(locations.Any(l => l.Contains(DemoData.Westgate.ToString())));
    }

    [TestMethod]
    public async Task Refresh_ARefreshTokenShownAgainLongAfterItWasReplaced_EndsTheWholeSignIn()
    {
        await using var dbContext = await DemoDatabase.CreateAsync(TestContext.CancellationToken);
        var clock = new TestClock();
        var signedIn = await SignInAsync(dbContext, clock);
        var first = await Refresh(dbContext, clock).ExecuteAsync(signedIn.RefreshToken!, TestContext.CancellationToken);
        var sessionId = (await dbContext.RefreshTokens.FirstAsync(TestContext.CancellationToken)).FamilyId;
        clock.Advance(TimeSpan.FromMinutes(1));

        // A second holder presents the first token; the person's own, newer token is refused with it.
        await Assert.ThrowsExactlyAsync<ApiException>(() =>
            Refresh(dbContext, clock).ExecuteAsync(signedIn.RefreshToken!, TestContext.CancellationToken));
        await Assert.ThrowsExactlyAsync<ApiException>(() =>
            Refresh(dbContext, clock).ExecuteAsync(first.RefreshToken, TestContext.CancellationToken));

        Assert.IsFalse(await IsOpenAsync(dbContext, clock, sessionId));
    }

    [TestMethod]
    public async Task Refresh_ARefreshTokenShownAgainWithinTheGracePeriod_GetsTheSameReplacementAgain()
    {
        await using var dbContext = await DemoDatabase.CreateAsync(TestContext.CancellationToken);
        var clock = new TestClock();
        var signedIn = await SignInAsync(dbContext, clock);
        var first = await Refresh(dbContext, clock).ExecuteAsync(signedIn.RefreshToken!, TestContext.CancellationToken);
        // Exactly at the end of the grace period is still inside it.
        clock.Advance(TimeSpan.FromSeconds(TokenSettings.RefreshReuseGraceSeconds));

        var second = await Refresh(dbContext, clock).ExecuteAsync(signedIn.RefreshToken!, TestContext.CancellationToken);

        Assert.IsFalse(string.IsNullOrEmpty(second.Response.AccessToken));
        // The first answer was lost: the replacement it carried is given again, and no second one is made.
        Assert.AreEqual(first.RefreshToken, second.RefreshToken);
        Assert.AreEqual(2, await dbContext.RefreshTokens.CountAsync(TestContext.CancellationToken));
        var sessionId = (await dbContext.RefreshTokens.FirstAsync(TestContext.CancellationToken)).FamilyId;
        Assert.IsTrue(await IsOpenAsync(dbContext, clock, sessionId));
    }

    [TestMethod]
    public async Task Refresh_AReplacementAlreadyUsed_IsNotGivenAgain_AndAThirdUseAfterTheGraceEndsTheSignIn()
    {
        await using var dbContext = await DemoDatabase.CreateAsync(TestContext.CancellationToken);
        var clock = new TestClock();
        var signedIn = await SignInAsync(dbContext, clock);
        var first = await Refresh(dbContext, clock).ExecuteAsync(signedIn.RefreshToken!, TestContext.CancellationToken);
        await Refresh(dbContext, clock).ExecuteAsync(first.RefreshToken!, TestContext.CancellationToken);

        // The replacement has been used since: a copy of the old token shown inside the grace gets minutes, nothing that lasts.
        var copy = await Refresh(dbContext, clock).ExecuteAsync(signedIn.RefreshToken!, TestContext.CancellationToken);
        Assert.IsNull(copy.RefreshToken);

        // Whoever shows the first replacement again after the grace has a copy: the whole sign-in ends.
        clock.Advance(TimeSpan.FromSeconds(TokenSettings.RefreshReuseGraceSeconds) + TimeSpan.FromMilliseconds(1));
        await Assert.ThrowsExactlyAsync<ApiException>(() =>
            Refresh(dbContext, clock).ExecuteAsync(first.RefreshToken!, TestContext.CancellationToken));
        var sessionId = (await dbContext.RefreshTokens.AsNoTracking().FirstAsync(TestContext.CancellationToken)).FamilyId;
        Assert.IsFalse(await IsOpenAsync(dbContext, clock, sessionId));
    }

    [TestMethod]
    public async Task Refresh_ARefreshTokenShownAgainJustAfterTheGracePeriod_EndsTheSignIn()
    {
        await using var dbContext = await DemoDatabase.CreateAsync(TestContext.CancellationToken);
        var clock = new TestClock();
        var signedIn = await SignInAsync(dbContext, clock);
        await Refresh(dbContext, clock).ExecuteAsync(signedIn.RefreshToken!, TestContext.CancellationToken);
        clock.Advance(TimeSpan.FromSeconds(TokenSettings.RefreshReuseGraceSeconds) + TimeSpan.FromMilliseconds(1));

        await Assert.ThrowsExactlyAsync<ApiException>(() =>
            Refresh(dbContext, clock).ExecuteAsync(signedIn.RefreshToken!, TestContext.CancellationToken));

        var sessionId = (await dbContext.RefreshTokens.AsNoTracking().FirstAsync(TestContext.CancellationToken)).FamilyId;
        Assert.IsFalse(await IsOpenAsync(dbContext, clock, sessionId));
    }

    [TestMethod]
    public async Task Refresh_ATokenAtTheEndOfItsLifetime_IsRefused()
    {
        await using var dbContext = await DemoDatabase.CreateAsync(TestContext.CancellationToken);
        var clock = new TestClock();
        var signedIn = await SignInAsync(dbContext, clock);
        clock.Advance(TimeSpan.FromSeconds(TokenSettings.RefreshLifetimeSeconds) - TimeSpan.FromMilliseconds(1));
        await Refresh(dbContext, clock).ExecuteAsync(signedIn.RefreshToken!, TestContext.CancellationToken);
        clock.Advance(TimeSpan.FromMilliseconds(1));

        // `ExpiresAt` is the first moment it no longer works, however often it was renewed.
        var newest = await dbContext.RefreshTokens.AsNoTracking().OrderByDescending(t => t.CreatedAt).FirstAsync(TestContext.CancellationToken);
        await Assert.ThrowsExactlyAsync<ApiException>(() =>
            Refresh(dbContext, clock).ExecuteAsync(signedIn.RefreshToken!, TestContext.CancellationToken));
        Assert.AreEqual(newest.ExpiresAt, clock.GetUtcNow());
    }

    [TestMethod]
    public async Task Refresh_TwoRefreshesOfOneTokenAtOnce_BothAreAnswered_WithTheOneNextToken()
    {
        await using var first = await DemoDatabase.CreateAsync(TestContext.CancellationToken);
        await using var second = TestPostgres.Reopen(first);
        var clock = new TestClock();
        var signedIn = await SignInAsync(first, clock);

        var both = await Task.WhenAll(
            Refresh(first, clock).ExecuteAsync(signedIn.RefreshToken!, TestContext.CancellationToken),
            Refresh(second, clock).ExecuteAsync(signedIn.RefreshToken!, TestContext.CancellationToken));

        Assert.IsTrue(both.All(issued => !string.IsNullOrEmpty(issued.Response.AccessToken)));
        Assert.IsTrue(both.All(issued => issued.RefreshToken is not null));
        Assert.AreEqual(both[0].RefreshToken, both[1].RefreshToken);
        var chain = await first.RefreshTokens.AsNoTracking().ToListAsync(TestContext.CancellationToken);
        Assert.HasCount(2, chain);
        Assert.AreEqual(1, chain.Count(t => t.RotatedAt is null));
        Assert.IsTrue(chain.All(t => t.RevokedAt is null));
    }

    [TestMethod]
    public async Task SigningOutWhileARefreshRuns_LeavesNoTokenOfTheSignInLive_WhicheverIsFirst()
    {
        await using var first = await DemoDatabase.CreateAsync(TestContext.CancellationToken);
        await using var second = TestPostgres.Reopen(first);
        var clock = new TestClock();

        for (var round = 0; round < 8; round++)
        {
            var signedIn = await SignInAsync(first, clock);

            var outcomes = await Task.WhenAll(
                Attempt(() => Refresh(first, clock).ExecuteAsync(signedIn.RefreshToken!, TestContext.CancellationToken)),
                Attempt(() => Revoke(second, clock).ExecuteAsync(signedIn.RefreshToken!, TestContext.CancellationToken)));

            // The refresh may be answered or refused, depending on which came first; what may not be left is a live token.
            Assert.IsTrue(outcomes.All(ok => ok != null));
            var sessionId = Guid.Parse(new JsonWebToken(signedIn.Response.AccessToken).GetClaim("sid").Value);
            var live = await first.RefreshTokens.AsNoTracking().CountAsync(t => t.FamilyId == sessionId && t.RevokedAt == null, TestContext.CancellationToken);
            Assert.AreEqual(0, live, $"round {round}: a token of an ended sign-in is still live");
        }
    }

    [TestMethod]
    public async Task Refresh_ATokenDeletedAfterItWasFound_BeforeTheLock_IsRefusedLikeAnUnknownOne()
    {
        await using var dbContext = await DemoDatabase.CreateAsync(TestContext.CancellationToken);
        var clock = new TestClock();
        var signedIn = await SignInAsync(dbContext, clock);
        var connectionString = dbContext.Database.GetConnectionString()!;
        // Another request (a sign-in clearing the person's ended tokens) deletes the token between this refresh finding it
        // and taking the sign-in's lock.
        await using var refreshing = new IdentityDbContext(
            new DbContextOptionsBuilder<IdentityDbContext>()
                .UseNpgsql(connectionString)
                .UseSnakeCaseNamingConvention()
                .AddInterceptors(new DeleteTokensBeforeTheLock(connectionString))
                .Options);

        // Refused as unknown (401), not a crash (500).
        await Assert.ThrowsExactlyAsync<ApiException>(() => Refresh(refreshing, clock).ExecuteAsync(signedIn.RefreshToken!, TestContext.CancellationToken));
    }

    [TestMethod]
    public async Task Refresh_RefusesATokenThatIsMissingUnknownRevokedOrPastItsLifetime_WithTheSameAnswer()
    {
        await using var dbContext = await DemoDatabase.CreateAsync(TestContext.CancellationToken);
        var clock = new TestClock();
        var revoked = await SignInAsync(dbContext, clock);
        await Revoke(dbContext, clock).ExecuteAsync(revoked.RefreshToken, TestContext.CancellationToken);
        var expired = await SignInAsync(dbContext, clock);
        clock.Advance(TimeSpan.FromSeconds(TokenSettings.RefreshLifetimeSeconds + 1));

        var messages = new List<string>();
        foreach (var token in new string?[] { null, "not-a-token", revoked.RefreshToken, expired.RefreshToken })
        {
            var ex = await Assert.ThrowsExactlyAsync<ApiException>(() =>
                Refresh(dbContext, clock).ExecuteAsync(token, TestContext.CancellationToken));
            Assert.AreEqual(ApiErrorCategory.Unauthorized, ex.Category);
            messages.Add(ex.Message);
        }

        Assert.HasCount(1, messages.Distinct());
    }

    [TestMethod]
    public async Task Refresh_RefusesAPersonWhoWasDeleted()
    {
        await using var dbContext = await DemoDatabase.CreateAsync(TestContext.CancellationToken);
        var clock = new TestClock();
        var signedIn = await SignInAsync(dbContext, clock);
        await dbContext.Users
            .Where(u => u.Email == "rita@northwind.test")
            .ExecuteUpdateAsync(set => set
                .SetProperty(u => u.IsDeleted, true)
                .SetProperty(u => u.DeletedAt, DateTimeOffset.UtcNow)
                .SetProperty(u => u.DeletedBy, Guid.NewGuid()), TestContext.CancellationToken);

        var ex = await Assert.ThrowsExactlyAsync<ApiException>(() =>
            Refresh(dbContext, clock).ExecuteAsync(signedIn.RefreshToken!, TestContext.CancellationToken));

        Assert.AreEqual(ApiErrorCategory.Unauthorized, ex.Category);
    }

    [TestMethod]
    public async Task Revoke_EndsTheWholeSignIn_NotAnotherOne_AndNeverFails()
    {
        await using var dbContext = await DemoDatabase.CreateAsync(TestContext.CancellationToken);
        var clock = new TestClock();
        var first = await SignInAsync(dbContext, clock);
        var firstNext = await Refresh(dbContext, clock).ExecuteAsync(first.RefreshToken, TestContext.CancellationToken);
        var second = await SignInAsync(dbContext, clock);

        // Revoking with the newest token ends the chain, including the token it replaced.
        await Revoke(dbContext, clock).ExecuteAsync(firstNext.RefreshToken, TestContext.CancellationToken);
        await Revoke(dbContext, clock).ExecuteAsync(firstNext.RefreshToken, TestContext.CancellationToken);
        await Revoke(dbContext, clock).ExecuteAsync("never-issued", TestContext.CancellationToken);
        await Revoke(dbContext, clock).ExecuteAsync(null, TestContext.CancellationToken);

        await Assert.ThrowsExactlyAsync<ApiException>(() =>
            Refresh(dbContext, clock).ExecuteAsync(firstNext.RefreshToken, TestContext.CancellationToken));
        var stillGood = await Refresh(dbContext, clock).ExecuteAsync(second.RefreshToken, TestContext.CancellationToken);
        Assert.IsFalse(string.IsNullOrEmpty(stillGood.Response.AccessToken));
    }

    [TestMethod]
    public async Task SignIn_ClearsTheTokensThatCanNoLongerBeUsed()
    {
        await using var dbContext = await DemoDatabase.CreateAsync(TestContext.CancellationToken);
        var clock = new TestClock();
        var old = await SignInAsync(dbContext, clock);
        await Revoke(dbContext, clock).ExecuteAsync(old.RefreshToken, TestContext.CancellationToken);

        await SignInAsync(dbContext, clock);

        Assert.AreEqual(1, await dbContext.RefreshTokens.CountAsync(TestContext.CancellationToken));
    }

    /// <summary>Runs a step that may be refused (a sign-out in the way); what matters is that it finishes.</summary>
    private static async Task<object> Attempt(Func<Task> step)
    {
        try
        {
            await step();
        }
        catch (ApiException)
        {
        }

        return new object();
    }

    private Task<IssuedTokens> SignInAsync(IdentityDbContext dbContext, TimeProvider clock) =>
        new CreateTokenCommandHandler(dbContext, Issuer(), new PasswordHasher<User>(), new SignInThrottle(clock), clock)
            .ExecuteAsync(new TokenCreateRequestDto("rita@northwind.test", DemoData.Password), TestContext.CancellationToken);

    /// <summary>Whether the sign-in still has a refresh token that is not revoked and not past its lifetime.</summary>
    private async Task<bool> IsOpenAsync(IdentityDbContext dbContext, TimeProvider clock, Guid sessionId)
    {
        var now = clock.GetUtcNow();
        return await dbContext.RefreshTokens.AnyAsync(
            t => t.FamilyId == sessionId && t.RevokedAt == null && t.ExpiresAt > now, TestContext.CancellationToken);
    }

    private static RefreshTokenCommandHandler Refresh(IdentityDbContext dbContext, TimeProvider clock) => new(dbContext, Issuer(), clock);

    private static RevokeTokenCommandHandler Revoke(IdentityDbContext dbContext, TimeProvider clock) => new(dbContext, clock);

    private static AccessTokenIssuer Issuer()
    {
        var keyProvider = new Mock<ISigningKeyProvider>();
        keyProvider.Setup(p => p.GetSigningKeyAsync(It.IsAny<CancellationToken>())).ReturnsAsync(_signingKey);
        return new AccessTokenIssuer(keyProvider.Object);
    }

    /// <summary>A clock the test moves, from now: sign-in lifetimes and the grace period are minutes and hours.</summary>
    private sealed class TestClock : TimeProvider
    {
        private DateTimeOffset _now = DateTimeOffset.UtcNow;

        public override DateTimeOffset GetUtcNow() => _now;

        public void Advance(TimeSpan by) => _now += by;
    }

    /// <summary>Deletes every refresh token from another connection just before the refresh's lock statement runs.</summary>
    private sealed class DeleteTokensBeforeTheLock : DbCommandInterceptor
    {
        private readonly string _connectionString;

        public DeleteTokensBeforeTheLock(string connectionString)
        {
            _connectionString = connectionString;
        }

        public override async ValueTask<InterceptionResult<int>> NonQueryExecutingAsync(
            DbCommand command,
            CommandEventData eventData,
            InterceptionResult<int> result,
            CancellationToken cancellationToken = default)
        {
            ArgumentNullException.ThrowIfNull(command);
            if (command.CommandText.Contains("FOR UPDATE", StringComparison.Ordinal))
            {
                await using var connection = new NpgsqlConnection(_connectionString);
                await connection.OpenAsync(cancellationToken);
                await using var delete = new NpgsqlCommand("DELETE FROM refresh_tokens", connection);
                await delete.ExecuteNonQueryAsync(cancellationToken);
            }

            return result;
        }
    }
}
