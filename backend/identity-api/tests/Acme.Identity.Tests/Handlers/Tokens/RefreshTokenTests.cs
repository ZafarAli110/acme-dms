using System.Security.Cryptography;
using Acme.Identity.BusinessLogic.Abstractions.Exceptions;
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
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;
using Moq;

namespace Acme.Identity.Tests.Handlers.Tokens;

/// <summary>Signing in gives a short access token and a refresh token; the refresh token is the only way to a new one.</summary>
[TestClass]
public sealed class RefreshTokenTests
{
    private static readonly RsaSecurityKey _signingKey = new(RSA.Create(2048)) { KeyId = "test" };

    public TestContext TestContext { get; set; } = null!;

    [TestMethod]
    public async Task SignIn_GivesAShortAccessTokenAndKeepsOnlyTheHashOfTheRefreshToken()
    {
        await using var dbContext = await DemoDatabase.CreateAsync(TestContext.CancellationToken);

        var signedIn = await SignInAsync(dbContext);

        var access = new JsonWebToken(signedIn.AccessToken);
        Assert.AreEqual(15 * 60, signedIn.ExpiresIn);
        Assert.AreEqual(TimeSpan.FromMinutes(15), access.ValidTo - access.ValidFrom);
        var stored = await dbContext.RefreshTokens.SingleAsync(TestContext.CancellationToken);
        Assert.AreNotEqual(signedIn.RefreshToken, stored.TokenHash);
        Assert.AreEqual(RefreshTokenSecret.Hash(signedIn.RefreshToken), stored.TokenHash);
        Assert.AreEqual(TimeSpan.FromHours(8), stored.ExpiresAt - stored.CreatedAt);
    }

    [TestMethod]
    public async Task Refresh_GivesANewAccessTokenForTheSamePerson()
    {
        await using var dbContext = await DemoDatabase.CreateAsync(TestContext.CancellationToken);
        var signedIn = await SignInAsync(dbContext);

        var refreshed = await Refresh(dbContext).ExecuteAsync(new TokenRefreshRequestDto(signedIn.RefreshToken), TestContext.CancellationToken);

        var token = new JsonWebToken(refreshed.AccessToken);
        Assert.AreEqual(DemoData.NorthwindMotors.ToString(), token.GetClaim("dealer_id").Value);
        Assert.AreEqual("rita@northwind.test", token.GetClaim("email").Value);
        Assert.HasCount(2, token.Claims.Where(c => c.Type == "locations"));
        Assert.AreEqual(15 * 60, refreshed.ExpiresIn);
    }

    [TestMethod]
    public async Task Refresh_ReadsTheLocationsAgain_SoAChangeTakesEffectWithinTheTokenLifetime()
    {
        await using var dbContext = await DemoDatabase.CreateAsync(TestContext.CancellationToken);
        var signedIn = await SignInAsync(dbContext);
        await dbContext.UserLocationRoles
            .Where(r => r.LocationId == DemoData.Westgate)
            .ExecuteUpdateAsync(set => set
                .SetProperty(r => r.IsDeleted, true)
                .SetProperty(r => r.DeletedAt, DateTimeOffset.UtcNow)
                .SetProperty(r => r.DeletedBy, Guid.NewGuid()), TestContext.CancellationToken);

        var refreshed = await Refresh(dbContext).ExecuteAsync(new TokenRefreshRequestDto(signedIn.RefreshToken), TestContext.CancellationToken);

        var locations = new JsonWebToken(refreshed.AccessToken).Claims.Where(c => c.Type == "locations").Select(c => c.Value).ToList();
        Assert.HasCount(1, locations);
        Assert.IsFalse(locations.Any(l => l.Contains(DemoData.Westgate.ToString())));
    }

    [TestMethod]
    public async Task Refresh_RefusesATokenThatIsUnknownRevokedOrPastItsLifetime_WithTheSameAnswer()
    {
        await using var dbContext = await DemoDatabase.CreateAsync(TestContext.CancellationToken);
        var revoked = await SignInAsync(dbContext);
        await Revoke(dbContext).ExecuteAsync(new TokenRevokeRequestDto(revoked.RefreshToken), TestContext.CancellationToken);
        var expired = await SignInAsync(dbContext);
        await dbContext.RefreshTokens
            .Where(t => t.TokenHash == RefreshTokenSecret.Hash(expired.RefreshToken))
            .ExecuteUpdateAsync(set => set.SetProperty(t => t.ExpiresAt, DateTimeOffset.UtcNow.AddMinutes(-1)), TestContext.CancellationToken);

        var messages = new List<string>();
        foreach (var token in new[] { "not-a-token", revoked.RefreshToken, expired.RefreshToken })
        {
            var ex = await Assert.ThrowsExactlyAsync<ApiException>(() =>
                Refresh(dbContext).ExecuteAsync(new TokenRefreshRequestDto(token), TestContext.CancellationToken));
            Assert.AreEqual(ApiErrorCategory.Unauthorized, ex.Category);
            messages.Add(ex.Message);
        }

        Assert.HasCount(1, messages.Distinct());
    }

    [TestMethod]
    public async Task Refresh_RefusesAPersonWhoWasDeleted()
    {
        await using var dbContext = await DemoDatabase.CreateAsync(TestContext.CancellationToken);
        var signedIn = await SignInAsync(dbContext);
        await dbContext.Users
            .Where(u => u.Email == "rita@northwind.test")
            .ExecuteUpdateAsync(set => set
                .SetProperty(u => u.IsDeleted, true)
                .SetProperty(u => u.DeletedAt, DateTimeOffset.UtcNow)
                .SetProperty(u => u.DeletedBy, Guid.NewGuid()), TestContext.CancellationToken);

        var ex = await Assert.ThrowsExactlyAsync<ApiException>(() =>
            Refresh(dbContext).ExecuteAsync(new TokenRefreshRequestDto(signedIn.RefreshToken), TestContext.CancellationToken));

        Assert.AreEqual(ApiErrorCategory.Unauthorized, ex.Category);
    }

    [TestMethod]
    public async Task Revoke_EndsOnlyThatSignIn_AndNeverFails()
    {
        await using var dbContext = await DemoDatabase.CreateAsync(TestContext.CancellationToken);
        var first = await SignInAsync(dbContext);
        var second = await SignInAsync(dbContext);

        await Revoke(dbContext).ExecuteAsync(new TokenRevokeRequestDto(first.RefreshToken), TestContext.CancellationToken);
        await Revoke(dbContext).ExecuteAsync(new TokenRevokeRequestDto(first.RefreshToken), TestContext.CancellationToken);
        await Revoke(dbContext).ExecuteAsync(new TokenRevokeRequestDto("never-issued"), TestContext.CancellationToken);

        await Assert.ThrowsExactlyAsync<ApiException>(() =>
            Refresh(dbContext).ExecuteAsync(new TokenRefreshRequestDto(first.RefreshToken), TestContext.CancellationToken));
        var stillGood = await Refresh(dbContext).ExecuteAsync(new TokenRefreshRequestDto(second.RefreshToken), TestContext.CancellationToken);
        Assert.IsFalse(string.IsNullOrEmpty(stillGood.AccessToken));
    }

    [TestMethod]
    public async Task SignIn_ClearsTheTokensThatCanNoLongerBeUsed()
    {
        await using var dbContext = await DemoDatabase.CreateAsync(TestContext.CancellationToken);
        var old = await SignInAsync(dbContext);
        await Revoke(dbContext).ExecuteAsync(new TokenRevokeRequestDto(old.RefreshToken), TestContext.CancellationToken);

        await SignInAsync(dbContext);

        Assert.AreEqual(1, await dbContext.RefreshTokens.CountAsync(TestContext.CancellationToken));
    }

    private Task<TokenCreateResponseDto> SignInAsync(IdentityDbContext dbContext) =>
        new CreateTokenCommandHandler(dbContext, Issuer(), new PasswordHasher<User>(), TimeProvider.System)
            .ExecuteAsync(new TokenCreateRequestDto("rita@northwind.test", DemoData.Password), TestContext.CancellationToken);

    private static RefreshTokenCommandHandler Refresh(IdentityDbContext dbContext) => new(dbContext, Issuer(), TimeProvider.System);

    private static RevokeTokenCommandHandler Revoke(IdentityDbContext dbContext) => new(dbContext, TimeProvider.System);

    private static AccessTokenIssuer Issuer()
    {
        var keyProvider = new Mock<ISigningKeyProvider>();
        keyProvider.Setup(p => p.GetSigningKeyAsync(It.IsAny<CancellationToken>())).ReturnsAsync(_signingKey);
        return new AccessTokenIssuer(keyProvider.Object);
    }
}
