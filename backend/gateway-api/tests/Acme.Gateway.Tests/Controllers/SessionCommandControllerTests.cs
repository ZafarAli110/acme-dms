using System.Text;
using Acme.Gateway.BusinessLogic.Abstractions.Handlers.Sessions.Create;
using Acme.Gateway.BusinessLogic.Abstractions.Handlers.Sessions.Delete;
using Acme.Gateway.BusinessLogic.Abstractions.RestClients;
using Acme.Gateway.DTO.Sessions;
using Acme.Gateway.Service.Controllers.Sessions;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.Hosting;
using Moq;

namespace Acme.Gateway.Tests.Controllers;

/// <summary>
/// The session cookie and the answers that reach the browser, through the controller as the gateway runs it. What a handler
/// decides is tested with the handlers.
/// </summary>
[TestClass]
public sealed class SessionCommandControllerTests
{
    public TestContext TestContext { get; set; } = null!;

    [TestMethod]
    public async Task CreateAsync_SetsAHostOnlySecureHttpOnlyStrictCookie_OnADevelopersMachineAsLive()
    {
        var (controller, response) = NewController(new CreateSessionResult("the-value", null));

        var result = await controller.CreateAsync(new SessionCreateRequestDto("maria@acme.test", "right"), TestContext.CancellationToken);

        Assert.IsInstanceOfType<NoContentResult>(result);
        var setCookie = response.Headers.SetCookie.ToString();
        StringAssert.StartsWith(setCookie, "__Host-acme_session=the-value;");
        foreach (var attribute in new[] { "httponly", "samesite=strict", "path=/", "secure" })
        {
            Assert.Contains(attribute, setCookie, StringComparison.OrdinalIgnoreCase);
        }

        Assert.DoesNotContain("domain=", setCookie, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("expires=", setCookie, StringComparison.OrdinalIgnoreCase);
    }

    [TestMethod]
    public async Task CreateAsync_PassesIdentityApisRefusalOnUnchanged_WithItsRetryAfter()
    {
        var body = Encoding.UTF8.GetBytes("""{"status":429,"detail":"Too many requests."}""");
        var (controller, response) = NewController(new CreateSessionResult(null, new IdentityRefusal(429, "application/problem+json", "30", body)));

        var result = await controller.CreateAsync(new SessionCreateRequestDto("maria@acme.test", "right"), TestContext.CancellationToken);
        await result.ExecuteResultAsync(new ActionContext(controller.HttpContext, new RouteData(), new Microsoft.AspNetCore.Mvc.Abstractions.ActionDescriptor()));

        Assert.AreEqual(429, response.StatusCode);
        Assert.AreEqual("30", response.Headers.RetryAfter.ToString());
        Assert.AreEqual("application/problem+json", response.ContentType);
        CollectionAssert.AreEqual(body, ((MemoryStream)response.Body).ToArray());
        Assert.IsFalse(response.Headers.ContainsKey("Set-Cookie"));
    }

    [TestMethod]
    public async Task DeleteAsync_RemovesTheCookie_WithoutHoldingTheAnswerOnTheBrowsersCache()
    {
        var (controller, response) = NewController(new CreateSessionResult("the-value", null));
        controller.HttpContext.Request.Headers.Cookie = "__Host-acme_session=the-value";

        var result = await controller.DeleteAsync(TestContext.CancellationToken);

        Assert.IsInstanceOfType<NoContentResult>(result);
        Assert.IsFalse(response.Headers.ContainsKey("Clear-Site-Data"));
        StringAssert.StartsWith(response.Headers.SetCookie.ToString(), "__Host-acme_session=;");
    }

    [TestMethod]
    public void ForgetCache_AsksTheBrowserToDropItsCache()
    {
        var (controller, response) = NewController(new CreateSessionResult("the-value", null));

        var result = controller.ForgetCache();

        Assert.IsInstanceOfType<NoContentResult>(result);
        Assert.AreEqual("\"cache\"", response.Headers["Clear-Site-Data"].ToString());
    }

    private static (SessionCommandController Controller, HttpResponse Response) NewController(CreateSessionResult createResult)
    {
        var create = new Mock<ICreateSessionCommandHandler>();
        create.Setup(handler => handler.ExecuteAsync(
                It.IsAny<SessionCreateRequestDto>(), It.IsAny<string?>(), It.IsAny<CallerContext>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(createResult);
        var httpContext = new DefaultHttpContext();
        httpContext.Response.Body = new MemoryStream();
        var controller = new SessionCommandController(create.Object, Mock.Of<IDeleteSessionCommandHandler>())
        {
            ControllerContext = new ControllerContext { HttpContext = httpContext },
        };
        return (controller, httpContext.Response);
    }
}
