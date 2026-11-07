using Acme.Identity.BusinessLogic.Abstractions.Handlers.System.GetHealth;
using Acme.Identity.DTO.System;
using Acme.Identity.Service.Controllers.System;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Moq;

namespace Acme.Identity.Tests.Controllers;

/// <summary>Health as Aspire and a load balancer read it: by its status code.</summary>
[TestClass]
public sealed class SystemControllerTests
{
    public TestContext TestContext { get; set; } = null!;

    [TestMethod]
    public async Task GetHealthAsync_Answers503_WhenDegraded_SoTheInstanceIsTakenOutOfService()
    {
        var result = await Controller("degraded").GetHealthAsync(TestContext.CancellationToken);

        var answer = (ObjectResult)result.Result!;
        Assert.AreEqual(StatusCodes.Status503ServiceUnavailable, answer.StatusCode);
        Assert.AreEqual("degraded", ((HealthCheckResponseDto)answer.Value!).Status);
    }

    [TestMethod]
    public async Task GetHealthAsync_Answers200_WhenFine()
    {
        var result = await Controller("ok").GetHealthAsync(TestContext.CancellationToken);

        Assert.IsNull(result.Result, "the body is returned as it is, with 200");
        Assert.AreEqual("ok", result.Value!.Status);
    }

    private static SystemController Controller(string status)
    {
        var health = new Mock<IGetHealthQueryHandler>();
        health.Setup(h => h.ExecuteAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(new HealthCheckResponseDto("identity-api", status, "26.11.0", true));
        return new SystemController(health.Object);
    }
}
