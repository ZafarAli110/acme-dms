using Acme.Identity.BusinessLogic.Abstractions.Signing;
using Acme.Identity.BusinessLogic.Handlers.Sessions.GetRevoked;
using Acme.Identity.Persistence.Entities;
using Acme.Identity.Tests.Support;
using Microsoft.EntityFrameworkCore;

namespace Acme.Identity.Tests.Handlers.Sessions;

/// <summary>The list of sign-ins that ended lately, which is how every service refuses the access tokens of an ended one.</summary>
[TestClass]
public sealed class GetRevokedSessionsTests
{
    public TestContext TestContext { get; set; } = null!;

    [TestMethod]
    public async Task ListsTheSignInsRevokedSinceAMoment_OnceEach_WithTheServicesOwnClock()
    {
        await using var dbContext = await DemoDatabase.CreateAsync(TestContext.CancellationToken);
        var clock = new TestClock();
        var recent = await AddAsync(dbContext, clock.GetUtcNow().AddSeconds(-10), tokens: 3);
        var before = await AddAsync(dbContext, clock.GetUtcNow().AddMinutes(-5), tokens: 1);
        var open = await AddAsync(dbContext, revokedAt: null, tokens: 2, clock: clock);

        var answer = await new GetRevokedSessionsQueryHandler(dbContext, clock).ExecuteAsync(clock.GetUtcNow().AddMinutes(-1), TestContext.CancellationToken);

        CollectionAssert.AreEquivalent(new[] { recent }, answer.Revoked.ToList());
        CollectionAssert.DoesNotContain(answer.Revoked.ToList(), before);
        CollectionAssert.DoesNotContain(answer.Revoked.ToList(), open);
        Assert.AreEqual(clock.GetUtcNow(), answer.Now);
    }

    [TestMethod]
    public async Task NeverLooksBackFurtherThanAnAccessTokenCanLive_WhateverIsAsked()
    {
        await using var dbContext = await DemoDatabase.CreateAsync(TestContext.CancellationToken);
        var clock = new TestClock();
        var old = await AddAsync(dbContext, clock.GetUtcNow().AddSeconds(-TokenSettings.RevokedFeedWindowSeconds - 5), tokens: 1);
        var inWindow = await AddAsync(dbContext, clock.GetUtcNow().AddSeconds(-TokenSettings.RevokedFeedWindowSeconds + 5), tokens: 1);

        var asked = await new GetRevokedSessionsQueryHandler(dbContext, clock).ExecuteAsync(DateTimeOffset.UnixEpoch, TestContext.CancellationToken);
        var notAsked = await new GetRevokedSessionsQueryHandler(dbContext, clock).ExecuteAsync(null, TestContext.CancellationToken);

        foreach (var answer in new[] { asked, notAsked })
        {
            CollectionAssert.AreEquivalent(new[] { inWindow }, answer.Revoked.ToList());
            CollectionAssert.DoesNotContain(answer.Revoked.ToList(), old);
        }
    }

    private static async Task<Guid> AddAsync(Acme.Identity.Persistence.Database.IdentityDbContext dbContext, DateTimeOffset? revokedAt, int tokens, TimeProvider? clock = null)
    {
        var family = Guid.NewGuid();
        var now = (clock ?? TimeProvider.System).GetUtcNow();
        for (var i = 0; i < tokens; i++)
        {
            dbContext.RefreshTokens.Add(new RefreshToken
            {
                UserId = Acme.Identity.BusinessLogic.Seeding.DemoData.Users[0].Id,
                FamilyId = family,
                TokenHash = Guid.NewGuid().ToString("N") + Guid.NewGuid().ToString("N"),
                CreatedAt = now.AddHours(-1),
                ExpiresAt = now.AddHours(7),
                RevokedAt = revokedAt,
            });
        }

        await dbContext.SaveChangesAsync();
        return family;
    }

    private sealed class TestClock : TimeProvider
    {
        private readonly DateTimeOffset _now = DateTimeOffset.UtcNow;

        public override DateTimeOffset GetUtcNow() => _now;
    }
}
