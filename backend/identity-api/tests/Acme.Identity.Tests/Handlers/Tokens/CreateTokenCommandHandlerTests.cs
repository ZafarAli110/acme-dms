using System.Security.Cryptography;
using Acme.Identity.BusinessLogic.Abstractions.Signing;
using Acme.Identity.BusinessLogic.Handlers.Tokens.Create;
using Acme.Identity.BusinessLogic.Seeding;
using Acme.Identity.DTO.Tokens;
using Acme.Identity.Persistence.Entities;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;
using Moq;
using Acme.Identity.BusinessLogic.Abstractions.Exceptions;
using Acme.Identity.Persistence.Database;

namespace Acme.Identity.Tests.Handlers.Tokens;

[TestClass]
public sealed class CreateTokenCommandHandlerTests
{
    private static readonly RsaSecurityKey SigningKey = new(RSA.Create(2048)) { KeyId = "test" };

    public TestContext TestContext { get; set; } = null!;

    [TestMethod]
    public async Task ExecuteAsync_IssuesATokenWithDealerAndLocationClaims()
    {
        await using var dbContext = await CreateSeededDbContextAsync();
        var handler = CreateHandler(dbContext);

        var response = await handler.ExecuteAsync(new TokenCreateRequestDto("bob@northwind.test", DemoData.Password), TestContext.CancellationToken);

        var token = new JsonWebToken(response.AccessToken);
        Assert.AreEqual(DemoData.NorthwindMotors.ToString(), token.GetClaim("dealer_id").Value);
        StringAssert.Contains(token.GetClaim("locations").Value, DemoData.Riverside.ToString());
        StringAssert.Contains(token.GetClaim("locations").Value, "stock.adjust");
        Assert.AreEqual(TokenSettings.Audience, token.Audiences.Single());
    }

    [TestMethod]
    public async Task ExecuteAsync_RejectsAWrongPassword()
    {
        await using var dbContext = await CreateSeededDbContextAsync();
        var handler = CreateHandler(dbContext);

        var ex = await Assert.ThrowsExactlyAsync<ApiException>(() =>
            handler.ExecuteAsync(new TokenCreateRequestDto("bob@northwind.test", "wrong"), TestContext.CancellationToken));

        Assert.AreEqual(ApiErrorCategory.Unauthorized, ex.Category);
    }

    private static CreateTokenCommandHandler CreateHandler(IdentityDbContext dbContext)
    {
        var keyProvider = new Mock<ISigningKeyProvider>();
        keyProvider.Setup(p => p.GetSigningKeyAsync(It.IsAny<CancellationToken>())).ReturnsAsync(SigningKey);
        return new CreateTokenCommandHandler(dbContext, keyProvider.Object, new PasswordHasher<User>(), TimeProvider.System);
    }

    private async Task<IdentityDbContext> CreateSeededDbContextAsync()
    {
        var options = new DbContextOptionsBuilder<IdentityDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options;
        var dbContext = new IdentityDbContext(options);
        var hasher = new PasswordHasher<User>();
        foreach (var (id, name) in DemoData.Dealers)
        {
            dbContext.Dealers.Add(new Dealer { Id = id, Name = name });
        }

        foreach (var (id, dealerId, code, name) in DemoData.Locations)
        {
            dbContext.Locations.Add(new Location { Id = id, DealerId = dealerId, Code = code, Name = name });
        }

        foreach (var demoUser in DemoData.Users)
        {
            var user = new User { Id = demoUser.Id, DealerId = demoUser.DealerId, Email = demoUser.Email, DisplayName = demoUser.DisplayName };
            user.PasswordHash = hasher.HashPassword(user, DemoData.Password);
            foreach (var (locationId, role) in demoUser.Roles)
            {
                user.LocationRoles.Add(new UserLocationRole { UserId = user.Id, LocationId = locationId, Role = role });
            }

            dbContext.Users.Add(user);
        }

        await dbContext.SaveChangesAsync(TestContext.CancellationToken);
        return dbContext;
    }
}
