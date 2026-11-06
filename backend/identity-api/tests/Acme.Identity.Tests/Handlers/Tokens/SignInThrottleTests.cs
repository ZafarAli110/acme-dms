using Acme.Identity.BusinessLogic.Abstractions.Exceptions;
using Acme.Identity.BusinessLogic.Handlers.Tokens.Create;
using Acme.Identity.BusinessLogic.Seeding;
using Acme.Identity.DTO.Tokens;
using Acme.Identity.Persistence.Entities;
using Acme.Identity.Tests.Support;
using Microsoft.AspNetCore.Identity;
using Moq;
using Acme.Identity.BusinessLogic.Abstractions.Signing;
using Acme.Identity.BusinessLogic.Handlers.Tokens;
using Microsoft.IdentityModel.Tokens;
using System.Security.Cryptography;

namespace Acme.Identity.Tests.Handlers.Tokens;

/// <summary>Guessing one person's password is slowed whatever address it comes from, and says nothing about which emails have an account.</summary>
[TestClass]
public sealed class SignInThrottleTests
{
    private static readonly RsaSecurityKey _signingKey = new(RSA.Create(2048)) { KeyId = "test" };

    public TestContext TestContext { get; set; } = null!;

    [TestMethod]
    public void TheFirstFiveWrongPasswordsAreFree_TheSixthTryWaits_AndEachFailureDoublesTheWaitUpToAnLimit()
    {
        var clock = new TestClock();
        var throttle = new SignInThrottle(clock);

        for (var i = 0; i < SignInThrottle.FreeFailures - 1; i++)
        {
            throttle.RecordFailure("rita@northwind.test");
            Assert.AreEqual(TimeSpan.Zero, throttle.WaitFor("rita@northwind.test"));
        }

        throttle.RecordFailure("rita@northwind.test");
        Assert.AreEqual(SignInThrottle.FirstWait, throttle.WaitFor("rita@northwind.test"));

        clock.Advance(SignInThrottle.FirstWait);
        Assert.AreEqual(TimeSpan.Zero, throttle.WaitFor("rita@northwind.test"));
        throttle.RecordFailure("rita@northwind.test");
        Assert.AreEqual(SignInThrottle.FirstWait * 2, throttle.WaitFor("rita@northwind.test"));

        for (var i = 0; i < 20; i++)
        {
            clock.Advance(SignInThrottle.LongestWait);
            throttle.RecordFailure("rita@northwind.test");
        }

        Assert.AreEqual(SignInThrottle.LongestWait, throttle.WaitFor("rita@northwind.test"));
    }

    [TestMethod]
    public void ARightPasswordClearsIt_AQuietSpellForgetsIt_AndAnotherEmailIsNotAffected()
    {
        var clock = new TestClock();
        var throttle = new SignInThrottle(clock);
        for (var i = 0; i < 6; i++)
        {
            throttle.RecordFailure("rita@northwind.test");
        }

        Assert.AreEqual(TimeSpan.Zero, throttle.WaitFor("tom@citymotors.test"));
        throttle.RecordSuccess("rita@northwind.test");
        Assert.AreEqual(TimeSpan.Zero, throttle.WaitFor("rita@northwind.test"));

        for (var i = 0; i < 5; i++)
        {
            throttle.RecordFailure("sam@northwind.test");
        }

        clock.Advance(SignInThrottle.ForgetAfter + TimeSpan.FromSeconds(1));
        Assert.AreEqual(TimeSpan.Zero, throttle.WaitFor("sam@northwind.test"));
        // Counting starts again: one failure after the quiet spell is the first, not the sixth.
        throttle.RecordFailure("sam@northwind.test");
        Assert.AreEqual(TimeSpan.Zero, throttle.WaitFor("sam@northwind.test"));
    }

    [TestMethod]
    public async Task SignIn_AfterFiveWrongPasswords_IsRefusedWith429AndHowLongToWait_ForAnEmailThatHasNoAccountToo()
    {
        await using var dbContext = await DemoDatabase.CreateAsync(TestContext.CancellationToken);
        var clock = new TestClock();
        var handler = NewHandler(dbContext, clock);

        foreach (var email in new[] { "rita@northwind.test", "nobody@nowhere.test" })
        {
            for (var i = 0; i < SignInThrottle.FreeFailures; i++)
            {
                var wrong = await Assert.ThrowsExactlyAsync<ApiException>(() =>
                    handler.ExecuteAsync(new TokenCreateRequestDto(email, "wrong"), TestContext.CancellationToken));
                Assert.AreEqual(ApiErrorCategory.Unauthorized, wrong.Category);
            }

            // The right password is not tried while it waits: the answer is the same whether or not it was right.
            var waiting = await Assert.ThrowsExactlyAsync<ApiException>(() =>
                handler.ExecuteAsync(new TokenCreateRequestDto(email, DemoData.Password), TestContext.CancellationToken));
            Assert.AreEqual(ApiErrorCategory.TooManyRequests, waiting.Category);
            Assert.AreEqual((int)SignInThrottle.FirstWait.TotalSeconds, waiting.RetryAfterSeconds);
        }
    }

    [TestMethod]
    public async Task SignIn_WithTheRightPasswordAfterTheWait_Works_AndStartsFresh()
    {
        await using var dbContext = await DemoDatabase.CreateAsync(TestContext.CancellationToken);
        var clock = new TestClock();
        var handler = NewHandler(dbContext, clock);
        for (var i = 0; i < SignInThrottle.FreeFailures; i++)
        {
            await Assert.ThrowsExactlyAsync<ApiException>(() =>
                handler.ExecuteAsync(new TokenCreateRequestDto("rita@northwind.test", "wrong"), TestContext.CancellationToken));
        }

        clock.Advance(SignInThrottle.FirstWait);
        var signedIn = await handler.ExecuteAsync(new TokenCreateRequestDto("rita@northwind.test", DemoData.Password), TestContext.CancellationToken);

        Assert.IsFalse(string.IsNullOrEmpty(signedIn.Response.AccessToken));
        await Assert.ThrowsExactlyAsync<ApiException>(() =>
            handler.ExecuteAsync(new TokenCreateRequestDto("rita@northwind.test", "wrong"), TestContext.CancellationToken));
        // One wrong password after a success is the first again, not the sixth: it does not wait.
        Assert.IsNotNull(await handler.ExecuteAsync(new TokenCreateRequestDto("rita@northwind.test", DemoData.Password), TestContext.CancellationToken));
    }

    private static CreateTokenCommandHandler NewHandler(Acme.Identity.Persistence.Database.IdentityDbContext dbContext, TimeProvider clock)
    {
        var keyProvider = new Mock<ISigningKeyProvider>();
        keyProvider.Setup(p => p.GetSigningKeyAsync(It.IsAny<CancellationToken>())).ReturnsAsync(_signingKey);
        return new CreateTokenCommandHandler(dbContext, new AccessTokenIssuer(keyProvider.Object), new PasswordHasher<User>(), new SignInThrottle(clock), clock);
    }

    private sealed class TestClock : TimeProvider
    {
        private DateTimeOffset _now = DateTimeOffset.UtcNow;

        public override DateTimeOffset GetUtcNow() => _now;

        public void Advance(TimeSpan by) => _now += by;
    }
}
