using Acme.Identity.BusinessLogic.Abstractions.Exceptions;
using Acme.Identity.BusinessLogic.Abstractions.Handlers.Tokens;
using Acme.Identity.BusinessLogic.Abstractions.Handlers.Tokens.Create;
using Acme.Identity.BusinessLogic.Abstractions.Handlers.Tokens.Refresh;
using Acme.Identity.BusinessLogic.Abstractions.Handlers.Tokens.Revoke;
using Acme.Identity.DTO.Tokens;
using Acme.Identity.Service.Controllers.Tokens;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Hosting;
using Moq;

namespace Acme.Identity.Tests.Controllers;

/// <summary>
/// The refresh token's cookie and the header that guards its endpoints, through the controller as the service runs it. What
/// a handler decides is tested with the handlers; this is what reaches the browser.
/// </summary>
[TestClass]
public sealed class TokenCommandControllerTests
{
    private const string Cookie = "acme_refresh";

    public TestContext TestContext { get; set; } = null!;

    [TestMethod]
    public async Task SignIn_PutsTheRefreshTokenInAnHttpOnlyStrictCookieForTheTokenEndpointsOnly_NotInTheBody()
    {
        var (controller, response, _) = NewController(Environments.Production);

        var result = await controller.CreateAsync(new TokenCreateRequestDto("rita@northwind.test", "x"), TestContext.CancellationToken);

        var setCookie = response.Headers.SetCookie.ToString();
        StringAssert.StartsWith(setCookie, $"{Cookie}=refresh-1;");
        foreach (var attribute in new[] { "httponly", "samesite=strict", "path=/api/identity/v1/tokens", "secure" })
        {
            Assert.Contains(attribute, setCookie, StringComparison.OrdinalIgnoreCase);
        }

        // A session cookie: no expiry, so the browser forgets it when it closes (the sign-in's own end is identity-api's).
        Assert.DoesNotContain("expires", setCookie, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("max-age", setCookie, StringComparison.OrdinalIgnoreCase);
        Assert.AreEqual("access-1", result.Value!.AccessToken);
        Assert.DoesNotContain("refresh-1", System.Text.Json.JsonSerializer.Serialize(result.Value), StringComparison.Ordinal);
    }

    [TestMethod]
    public async Task TheCookieIsNotMarkedSecureInLocalDevelopment_WhichIsPlainHttp()
    {
        var (controller, response, _) = NewController(Environments.Development);

        await controller.CreateAsync(new TokenCreateRequestDto("rita@northwind.test", "x"), TestContext.CancellationToken);

        Assert.DoesNotContain("secure", response.Headers.SetCookie.ToString().Replace("samesite", string.Empty, StringComparison.OrdinalIgnoreCase), StringComparison.OrdinalIgnoreCase);
    }

    [TestMethod]
    public async Task RefreshAndRevoke_RefuseARequestThatIsNotFromThePage_WithoutTouchingTheToken()
    {
        var (controller, response, handlers) = NewController(Environments.Production, withCookie: "refresh-1", fromThePage: false);

        var refresh = await Assert.ThrowsExactlyAsync<ApiException>(() => controller.RefreshAsync(TestContext.CancellationToken));
        var revoke = await Assert.ThrowsExactlyAsync<ApiException>(() => controller.RevokeAsync(TestContext.CancellationToken));

        Assert.AreEqual(ApiErrorCategory.Forbidden, refresh.Category);
        Assert.AreEqual(ApiErrorCategory.Forbidden, revoke.Category);
        handlers.Refresh.Verify(h => h.ExecuteAsync(It.IsAny<string?>(), It.IsAny<CancellationToken>()), Times.Never);
        handlers.Revoke.Verify(h => h.ExecuteAsync(It.IsAny<string?>(), It.IsAny<CancellationToken>()), Times.Never);
        Assert.IsEmpty(response.Headers.SetCookie);
    }

    [TestMethod]
    public async Task Refresh_HandsTheHandlerTheCookie_AndReplacesItWithTheNewToken()
    {
        var (controller, response, handlers) = NewController(Environments.Production, withCookie: "refresh-1");

        var result = await controller.RefreshAsync(TestContext.CancellationToken);

        handlers.Refresh.Verify(h => h.ExecuteAsync("refresh-1", It.IsAny<CancellationToken>()), Times.Once);
        StringAssert.StartsWith(response.Headers.SetCookie.ToString(), $"{Cookie}=refresh-2;");
        Assert.AreEqual("access-2", result.Value!.AccessToken);
    }

    [TestMethod]
    public async Task Refresh_ThatGetsNoNewRefreshToken_LeavesTheCookieAsItIs()
    {
        var (controller, response, handlers) = NewController(Environments.Production, withCookie: "refresh-1");
        handlers.Refresh
            .Setup(h => h.ExecuteAsync(It.IsAny<string?>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new IssuedTokens(new TokenCreateResponseDto("access-3", "Bearer", 900), null));

        await controller.RefreshAsync(TestContext.CancellationToken);

        Assert.IsEmpty(response.Headers.SetCookie);
    }

    [TestMethod]
    public async Task Revoke_EndsTheCookiesSignIn_AndRemovesTheCookie_WithTheSameAttributesSoTheBrowserMatchesIt()
    {
        var (controller, response, handlers) = NewController(Environments.Production, withCookie: "refresh-1");

        var result = await controller.RevokeAsync(TestContext.CancellationToken);

        Assert.IsInstanceOfType<NoContentResult>(result);
        handlers.Revoke.Verify(h => h.ExecuteAsync("refresh-1", It.IsAny<CancellationToken>()), Times.Once);
        var setCookie = response.Headers.SetCookie.ToString();
        StringAssert.StartsWith(setCookie, $"{Cookie}=;");
        Assert.Contains("expires=Thu, 01 Jan 1970", setCookie, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("path=/api/identity/v1/tokens", setCookie, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("httponly", setCookie, StringComparison.OrdinalIgnoreCase);
    }

    private static (TokenCommandController Controller, HttpResponse Response, Handlers Handlers) NewController(
        string environment, string? withCookie = null, bool fromThePage = true)
    {
        var create = new Mock<ICreateTokenCommandHandler>();
        create.Setup(h => h.ExecuteAsync(It.IsAny<TokenCreateRequestDto>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new IssuedTokens(new TokenCreateResponseDto("access-1", "Bearer", 900), "refresh-1"));
        var refresh = new Mock<IRefreshTokenCommandHandler>();
        refresh.Setup(h => h.ExecuteAsync(It.IsAny<string?>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new IssuedTokens(new TokenCreateResponseDto("access-2", "Bearer", 900), "refresh-2"));
        var revoke = new Mock<IRevokeTokenCommandHandler>();
        var hostEnvironment = new Mock<IHostEnvironment>();
        hostEnvironment.SetupGet(e => e.EnvironmentName).Returns(environment);

        var http = new DefaultHttpContext();
        if (withCookie is not null)
        {
            http.Request.Headers.Cookie = $"{Cookie}={withCookie}";
        }

        if (fromThePage)
        {
            http.Request.Headers["X-Requested-With"] = "acme-web";
        }

        var controller = new TokenCommandController(create.Object, refresh.Object, revoke.Object, hostEnvironment.Object)
        {
            ControllerContext = new ControllerContext { HttpContext = http },
        };
        return (controller, http.Response, new Handlers(refresh, revoke));
    }

    private sealed record Handlers(Mock<IRefreshTokenCommandHandler> Refresh, Mock<IRevokeTokenCommandHandler> Revoke);
}
