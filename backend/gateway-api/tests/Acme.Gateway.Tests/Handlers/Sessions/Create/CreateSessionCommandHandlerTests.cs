using System.Text;
using Acme.Gateway.BusinessLogic.Abstractions.Handlers.Sessions.Create;
using Acme.Gateway.BusinessLogic.Abstractions.RestClients;
using Acme.Gateway.BusinessLogic.Handlers.Sessions;
using Acme.Gateway.DTO.Sessions;
using Acme.Gateway.Tests.Support;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Acme.Gateway.Tests.Handlers.Sessions.Create;

/// <summary>Signing in: identity-api checks the password; the gateway keeps what it issues, encrypted, in a new session.</summary>
[TestClass]
public sealed class CreateSessionCommandHandlerTests
{
    private static readonly CallerContext _caller = new(GatewayUnderTest.BrowserAddress, null);

    public TestContext TestContext { get; set; } = null!;

    [TestMethod]
    public async Task ExecuteAsync_KeepsTheTokensEncrypted_WithAKeyOnlyTheCookieGives()
    {
        await using var gateway = await GatewayUnderTest.NewAsync(TestContext.CancellationToken);

        var result = await ExecuteAsync(gateway, "right", replacedCookie: null);

        var cookie = result.CookieValue!;
        await using var dbContext = gateway.NewDbContext();
        var session = await dbContext.Sessions.SingleAsync(TestContext.CancellationToken);
        Assert.AreEqual(SessionSecrets.IdOf(cookie), session.Id, "the row is found by the cookie's hash; the cookie is not stored");
        var stored = Encoding.UTF8.GetString(session.Tokens);
        Assert.DoesNotContain("refresh-1", stored);
        Assert.DoesNotContain("eyJ", stored);
        Assert.IsNull(SessionSecrets.Open(SessionSecrets.NewValue(), session.Tokens), "another cookie value cannot open the tokens");
        Assert.AreEqual("refresh-1", SessionSecrets.Open(cookie, session.Tokens)?.RefreshToken);
        Assert.AreEqual(FakeIdentity.UserId, session.UserId);
    }

    [TestMethod]
    public async Task ExecuteAsync_EndsTheSessionTheBrowserHad_AndItsRefreshToken()
    {
        await using var gateway = await GatewayUnderTest.NewAsync(TestContext.CancellationToken);
        var first = await ExecuteAsync(gateway, "right", replacedCookie: null);

        var second = await ExecuteAsync(gateway, "right", replacedCookie: first.CookieValue);

        await using var dbContext = gateway.NewDbContext();
        var session = await dbContext.Sessions.SingleAsync(TestContext.CancellationToken);
        Assert.AreEqual(SessionSecrets.IdOf(second.CookieValue!), session.Id);
        Assert.AreEqual("refresh-1", gateway.Identity.Revoked.Single());
    }

    [TestMethod]
    public async Task ExecuteAsync_GivesIdentityApisRefusal_AndKeepsNoSession()
    {
        await using var gateway = await GatewayUnderTest.NewAsync(TestContext.CancellationToken);

        var result = await ExecuteAsync(gateway, "wrong", replacedCookie: null);

        Assert.IsNull(result.CookieValue);
        Assert.AreEqual(401, result.Refusal!.Status);
        StringAssert.Contains(Encoding.UTF8.GetString(result.Refusal.Body), "Wrong email or password.");
        await using var dbContext = gateway.NewDbContext();
        Assert.AreEqual(0, await dbContext.Sessions.CountAsync(TestContext.CancellationToken));
    }

    [TestMethod]
    public async Task ExecuteAsync_ThrowsUnavailable_WhenIdentityApiIsDown()
    {
        await using var gateway = await GatewayUnderTest.NewAsync(TestContext.CancellationToken);
        gateway.Identity.IsDown = true;

        await Assert.ThrowsExactlyAsync<IdentityUnavailableException>(() => ExecuteAsync(gateway, "right", replacedCookie: null));
    }

    private async Task<CreateSessionResult> ExecuteAsync(GatewayUnderTest gateway, string password, string? replacedCookie)
    {
        await using var scope = gateway.Services.CreateAsyncScope();
        return await scope.ServiceProvider.GetRequiredService<ICreateSessionCommandHandler>().ExecuteAsync(
            new SessionCreateRequestDto("maria@acme.test", password),
            replacedCookie,
            _caller,
            TestContext.CancellationToken);
    }
}
