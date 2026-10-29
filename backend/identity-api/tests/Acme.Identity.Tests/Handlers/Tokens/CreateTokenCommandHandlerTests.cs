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
using Acme.Identity.Tests.Support;

namespace Acme.Identity.Tests.Handlers.Tokens;

[TestClass]
public sealed class CreateTokenCommandHandlerTests
{
    private static readonly RsaSecurityKey SigningKey = new(RSA.Create(2048)) { KeyId = "test" };

    public TestContext TestContext { get; set; } = null!;

    [TestMethod]
    public async Task ExecuteAsync_IssuesATokenWithDealerAndLocationClaims()
    {
        await using var dbContext = await DemoDatabase.CreateAsync(TestContext.CancellationToken);
        var handler = CreateHandler(dbContext);

        var response = await handler.ExecuteAsync(new TokenCreateRequestDto("rita@northwind.test", DemoData.Password), TestContext.CancellationToken);

        var token = new JsonWebToken(response.AccessToken);
        Assert.AreEqual(DemoData.NorthwindMotors.ToString(), token.GetClaim("dealer_id").Value);
        StringAssert.Contains(token.GetClaim("locations").Value, DemoData.Riverside.ToString());
        StringAssert.Contains(token.GetClaim("locations").Value, "customers.write");
        Assert.AreEqual(TokenSettings.Audience, token.Audiences.Single());
    }

    [TestMethod]
    public async Task ExecuteAsync_RejectsAWrongPassword()
    {
        await using var dbContext = await DemoDatabase.CreateAsync(TestContext.CancellationToken);
        var handler = CreateHandler(dbContext);

        var ex = await Assert.ThrowsExactlyAsync<ApiException>(() =>
            handler.ExecuteAsync(new TokenCreateRequestDto("rita@northwind.test", "wrong"), TestContext.CancellationToken));

        Assert.AreEqual(ApiErrorCategory.Unauthorized, ex.Category);
    }

    private static CreateTokenCommandHandler CreateHandler(IdentityDbContext dbContext)
    {
        var keyProvider = new Mock<ISigningKeyProvider>();
        keyProvider.Setup(p => p.GetSigningKeyAsync(It.IsAny<CancellationToken>())).ReturnsAsync(SigningKey);
        return new CreateTokenCommandHandler(dbContext, keyProvider.Object, new PasswordHasher<User>(), TimeProvider.System);
    }
}
