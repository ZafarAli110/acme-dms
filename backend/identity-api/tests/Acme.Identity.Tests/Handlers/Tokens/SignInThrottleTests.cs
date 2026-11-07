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
            throttle.Begin("rita@northwind.test");
            Assert.AreEqual(TimeSpan.Zero, throttle.WaitFor("rita@northwind.test"));
        }

        throttle.Begin("rita@northwind.test");
        Assert.AreEqual(SignInThrottle.FirstWait, throttle.WaitFor("rita@northwind.test"));

        clock.Advance(SignInThrottle.FirstWait);
        Assert.AreEqual(TimeSpan.Zero, throttle.WaitFor("rita@northwind.test"));
        throttle.Begin("rita@northwind.test");
        Assert.AreEqual(SignInThrottle.FirstWait * 2, throttle.WaitFor("rita@northwind.test"));

        for (var i = 0; i < 20; i++)
        {
            clock.Advance(SignInThrottle.LongestWait);
            throttle.Begin("rita@northwind.test");
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
            throttle.Begin("rita@northwind.test");
        }

        Assert.AreEqual(TimeSpan.Zero, throttle.WaitFor("tom@citymotors.test"));
        throttle.RecordSuccess("rita@northwind.test");
        Assert.AreEqual(TimeSpan.Zero, throttle.WaitFor("rita@northwind.test"));

        for (var i = 0; i < 5; i++)
        {
            throttle.Begin("sam@northwind.test");
        }

        clock.Advance(SignInThrottle.ForgetAfter + TimeSpan.FromSeconds(1));
        Assert.AreEqual(TimeSpan.Zero, throttle.WaitFor("sam@northwind.test"));
        // Counting starts again: one failure after the quiet spell is the first, not the sixth.
        throttle.Begin("sam@northwind.test");
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

    [TestMethod]
    public async Task SignIn_TwentyWrongPasswordsSentAtOnce_AtMostFiveAreChecked()
    {
        await using var dbContext = await DemoDatabase.CreateAsync(TestContext.CancellationToken);
        var clock = new TestClock();
        var throttle = new SignInThrottle(clock);
        var hasher = new CountingHasher();

        var outcomes = await Task.WhenAll(Enumerable.Range(0, 20).Select(async _ =>
        {
            // Each request has its own database context, as each request of the service does.
            await using var own = TestPostgres.Reopen(dbContext);
            var handler = NewHandler(own, clock, throttle, hasher);
            var refused = await Assert.ThrowsExactlyAsync<ApiException>(() =>
                handler.ExecuteAsync(new TokenCreateRequestDto("rita@northwind.test", "wrong"), TestContext.CancellationToken));
            return refused.Category;
        }));

        Assert.AreEqual(SignInThrottle.FreeFailures, hasher.Checks, "only the free attempts reach the password check");
        Assert.AreEqual(20 - SignInThrottle.FreeFailures, outcomes.Count(c => c == ApiErrorCategory.TooManyRequests));
    }

    [TestMethod]
    public void AnAttemptAbandonedWithoutAVerdict_IsNotCounted()
    {
        var clock = new TestClock();
        var throttle = new SignInThrottle(clock);
        for (var i = 0; i < SignInThrottle.FreeFailures - 1; i++)
        {
            throttle.Begin("rita@northwind.test");
        }

        // The fifth attempt would start the wait; it ends in a database error instead, with no verdict on the password.
        Assert.AreEqual(TimeSpan.Zero, throttle.Begin("rita@northwind.test"));
        Assert.AreEqual(SignInThrottle.FirstWait, throttle.WaitFor("rita@northwind.test"));
        throttle.Abandon("rita@northwind.test");

        Assert.AreEqual(TimeSpan.Zero, throttle.WaitFor("rita@northwind.test"), "the wait it started is gone too");
        Assert.AreEqual(TimeSpan.Zero, throttle.Begin("rita@northwind.test"), "it is still the fifth attempt");
    }

    private static CreateTokenCommandHandler NewHandler(Acme.Identity.Persistence.Database.IdentityDbContext dbContext, TimeProvider clock) =>
        NewHandler(dbContext, clock, new SignInThrottle(clock), new PasswordHasher<User>());

    private static CreateTokenCommandHandler NewHandler(
        Acme.Identity.Persistence.Database.IdentityDbContext dbContext,
        TimeProvider clock,
        SignInThrottle throttle,
        IPasswordHasher<User> hasher)
    {
        var keyProvider = new Mock<ISigningKeyProvider>();
        keyProvider.Setup(p => p.GetSigningKeyAsync(It.IsAny<CancellationToken>())).ReturnsAsync(_signingKey);
        return new CreateTokenCommandHandler(dbContext, new AccessTokenIssuer(keyProvider.Object), hasher, throttle, clock);
    }

    /// <summary>The real hasher, counting the passwords it checks; slow, as the real check is.</summary>
    private sealed class CountingHasher : PasswordHasher<User>
    {
        private int _checks;

        public int Checks => _checks;

        public override PasswordVerificationResult VerifyHashedPassword(User user, string hashedPassword, string providedPassword)
        {
            Interlocked.Increment(ref _checks);
            return base.VerifyHashedPassword(user, hashedPassword, providedPassword);
        }
    }

    private sealed class TestClock : TimeProvider
    {
        private DateTimeOffset _now = DateTimeOffset.UtcNow;

        public override DateTimeOffset GetUtcNow() => _now;

        public void Advance(TimeSpan by) => _now += by;
    }
}
