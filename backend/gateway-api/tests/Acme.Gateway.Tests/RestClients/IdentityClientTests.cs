using System.Net;
using System.Net.Http.Json;
using System.Security.Claims;
using Acme.Gateway.BusinessLogic.Abstractions.RestClients;
using Acme.Gateway.RestClients.Identity;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;

namespace Acme.Gateway.Tests.RestClients;

/// <summary>
/// The client for identity-api's token endpoints, against answers as identity-api gives them: what it reads, what it sends,
/// and how each kind of failure comes out.
/// </summary>
[TestClass]
public sealed class IdentityClientTests
{
    private static readonly CallerContext _caller = new("203.0.113.7", "fr");
    private static readonly Guid _userId = Guid.Parse("0190a000-0000-7000-8000-000000000001");

    public TestContext TestContext { get; set; } = null!;

    [TestMethod]
    public async Task SignInAsync_ReadsTheRefreshTokenFromItsCookie_AndForwardsTheBrowsersAddressAndLanguage()
    {
        var identity = new Answers(_ => TokenAnswer("refresh-1"));

        var result = await Client(identity).SignInAsync("maria@acme.test", "right", _caller, TestContext.CancellationToken);

        Assert.AreEqual("refresh-1", result.Tokens!.RefreshToken);
        Assert.AreEqual(_userId, result.Tokens.UserId);
        var sent = identity.Requests.Single();
        Assert.AreEqual("203.0.113.7", sent.Headers.GetValues("X-Forwarded-For").Single());
        Assert.AreEqual("fr", sent.Headers.AcceptLanguage.ToString());
    }

    [TestMethod]
    public async Task SignInAsync_GivesARefusalForThePerson_AsItCame()
    {
        foreach (var status in new[] { HttpStatusCode.BadRequest, HttpStatusCode.Unauthorized, HttpStatusCode.TooManyRequests })
        {
            var identity = new Answers(_ => new HttpResponseMessage(status) { Content = new StringContent("{}") });

            var result = await Client(identity).SignInAsync("maria@acme.test", "x", _caller, TestContext.CancellationToken);

            Assert.AreEqual((int)status, result.Refusal!.Status);
        }
    }

    [TestMethod]
    public async Task SignInAsync_ThrowsUnavailable_ForAnyOtherAnswer_AndWhenIdentityApiCannotBeReached()
    {
        var failing = new Answers(_ => new HttpResponseMessage(HttpStatusCode.InternalServerError));
        var unreachable = new Answers(_ => throw new HttpRequestException("Connection refused"));

        await Assert.ThrowsExactlyAsync<IdentityUnavailableException>(() =>
            Client(failing).SignInAsync("maria@acme.test", "x", _caller, TestContext.CancellationToken));
        await Assert.ThrowsExactlyAsync<IdentityUnavailableException>(() =>
            Client(unreachable).SignInAsync("maria@acme.test", "x", _caller, TestContext.CancellationToken));
    }

    [TestMethod]
    public async Task RefreshAsync_SendsTheRefreshTokenAsIdentityApisCookie_WithThePagesHeader()
    {
        var identity = new Answers(_ => TokenAnswer("refresh-2"));

        var renewed = await Client(identity).RefreshAsync("refresh-1", _caller, TestContext.CancellationToken);

        Assert.AreEqual("refresh-2", renewed!.RefreshToken);
        var sent = identity.Requests.Single();
        Assert.AreEqual("/v1/tokens/refresh", sent.RequestUri!.AbsolutePath);
        Assert.AreEqual("acme_refresh=refresh-1", sent.Headers.GetValues("Cookie").Single());
        Assert.AreEqual("acme-web", sent.Headers.GetValues("X-Requested-With").Single());
    }

    [TestMethod]
    public async Task RefreshAsync_KeepsTheRefreshTokenItGave_WhenIdentityApiSetsNoNewOne()
    {
        var identity = new Answers(_ => TokenAnswer(refreshToken: null));

        var renewed = await Client(identity).RefreshAsync("refresh-1", _caller, TestContext.CancellationToken);

        Assert.AreEqual("refresh-1", renewed!.RefreshToken);
    }

    [TestMethod]
    public async Task RefreshAsync_GivesNothing_WhenIdentityApiEndedTheSignIn()
    {
        var identity = new Answers(_ => new HttpResponseMessage(HttpStatusCode.Unauthorized));

        Assert.IsNull(await Client(identity).RefreshAsync("refresh-1", _caller, TestContext.CancellationToken));
    }

    private static IdentityClient Client(HttpMessageHandler identity) =>
        new(new HttpClient(identity) { BaseAddress = new Uri("http://identity.test") }, TimeProvider.System);

    private static HttpResponseMessage TokenAnswer(string? refreshToken)
    {
        var accessToken = new JsonWebTokenHandler().CreateToken(new SecurityTokenDescriptor
        {
            Subject = new ClaimsIdentity([new Claim("sub", _userId.ToString())]),
            Expires = DateTime.UtcNow.AddMinutes(15),
            SigningCredentials = new SigningCredentials(new SymmetricSecurityKey(new byte[32]), SecurityAlgorithms.HmacSha256),
        });
        var response = new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = JsonContent.Create(new { accessToken, tokenType = "Bearer", expiresIn = 900 }),
        };
        if (refreshToken is not null)
        {
            response.Headers.Add("Set-Cookie", $"acme_refresh={refreshToken}; path=/api/identity/v1/tokens; samesite=strict; httponly");
        }

        return response;
    }

    /// <summary>identity-api, answering every request with what the test gives, and keeping what was sent.</summary>
    private sealed class Answers(Func<HttpRequestMessage, HttpResponseMessage> answer) : HttpMessageHandler
    {
        public List<HttpRequestMessage> Requests { get; } = [];

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Requests.Add(request);
            return Task.FromResult(answer(request));
        }
    }
}
