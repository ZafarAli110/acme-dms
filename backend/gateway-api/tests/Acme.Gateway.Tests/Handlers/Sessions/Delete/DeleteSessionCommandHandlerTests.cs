using Acme.Gateway.BusinessLogic.Abstractions.Handlers.Sessions.Delete;
using Acme.Gateway.BusinessLogic.Abstractions.RestClients;
using Acme.Gateway.BusinessLogic.Handlers.Sessions;
using Acme.Gateway.Tests.Support;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Acme.Gateway.Tests.Handlers.Sessions.Delete;

/// <summary>Signing out: the session is deleted at once, and its refresh token ended at identity-api.</summary>
[TestClass]
public sealed class DeleteSessionCommandHandlerTests
{
    private static readonly CallerContext _caller = new(GatewayUnderTest.BrowserAddress, null);

    public TestContext TestContext { get; set; } = null!;

    [TestMethod]
    public async Task ExecuteAsync_DeletesTheSession_AndEndsItsRefreshTokenAtIdentityApi()
    {
        await using var gateway = await GatewayUnderTest.NewAsync(TestContext.CancellationToken);
        var cookie = await gateway.SignInForCookieAsync(TestContext.CancellationToken);

        await ExecuteAsync(gateway, cookie);

        await using var dbContext = gateway.NewDbContext();
        Assert.AreEqual(0, await dbContext.Sessions.CountAsync(TestContext.CancellationToken));
        Assert.AreEqual("refresh-1", gateway.Identity.Revoked.Single());
    }

    [TestMethod]
    public async Task ExecuteAsync_StillDeletesTheSession_WhenIdentityApiIsDown()
    {
        await using var gateway = await GatewayUnderTest.NewAsync(TestContext.CancellationToken);
        var cookie = await gateway.SignInForCookieAsync(TestContext.CancellationToken);
        gateway.Identity.IsDown = true;

        await ExecuteAsync(gateway, cookie);

        await using var dbContext = gateway.NewDbContext();
        Assert.AreEqual(0, await dbContext.Sessions.CountAsync(TestContext.CancellationToken));
    }

    [TestMethod]
    public async Task ExecuteAsync_DoesNothing_ForACookieWithNoSession()
    {
        await using var gateway = await GatewayUnderTest.NewAsync(TestContext.CancellationToken);

        await ExecuteAsync(gateway, SessionSecrets.NewValue());

        Assert.IsEmpty(gateway.Identity.Revoked);
    }

    private async Task ExecuteAsync(GatewayUnderTest gateway, string cookie)
    {
        await using var scope = gateway.Services.CreateAsyncScope();
        await scope.ServiceProvider.GetRequiredService<IDeleteSessionCommandHandler>().ExecuteAsync(cookie, _caller, TestContext.CancellationToken);
    }
}
