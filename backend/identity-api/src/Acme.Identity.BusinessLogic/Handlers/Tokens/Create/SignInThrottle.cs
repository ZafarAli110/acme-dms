using System.Collections.Concurrent;

namespace Acme.Identity.BusinessLogic.Handlers.Tokens.Create;

/// <summary>
/// Slows guessing a person's password, whatever address it comes from (the per-address limit in front of the endpoint
/// cannot stop many addresses): after <see cref="FreeFailures"/> wrong passwords in a row for one email, the next attempts
/// wait, for longer each time (<see cref="FirstWait"/>, doubling, up to <see cref="LongestWait"/>), until a right password or
/// a quiet <see cref="ForgetAfter"/>. An email nobody has an account for is counted the same, so the wait does not say which
/// emails have one. The wait is short at first on purpose: a person who is locked out only waits; it is no way to lock someone out
/// for good. In memory, so each instance of the service counts for itself.
/// An attempt is counted as a failure when it starts (<see cref="Begin"/>), before the slow password check, and a right
/// password clears the count: guesses sent at once cannot all pass the check before the first failure is recorded.
/// </summary>
public sealed class SignInThrottle
{
    public const int FreeFailures = 5;
    public static readonly TimeSpan FirstWait = TimeSpan.FromSeconds(30);
    public static readonly TimeSpan LongestWait = TimeSpan.FromMinutes(15);
    public static readonly TimeSpan ForgetAfter = TimeSpan.FromMinutes(30);

    /// <summary>Past this many emails remembered, the ones not heard from for a while are dropped.</summary>
    private const int MaxRemembered = 20_000;

    private readonly ConcurrentDictionary<string, Attempts> _attempts = new(StringComparer.Ordinal);
    private readonly TimeProvider _timeProvider;

    public SignInThrottle(TimeProvider timeProvider)
    {
        _timeProvider = timeProvider;
    }

    /// <summary>How long this email must wait before it may try again; zero when it may try now.</summary>
    public TimeSpan WaitFor(string email)
    {
        var now = _timeProvider.GetUtcNow();
        if (!_attempts.TryGetValue(email, out var attempts))
        {
            return TimeSpan.Zero;
        }

        lock (attempts)
        {
            if (now - attempts.LastFailureAt > ForgetAfter)
            {
                return TimeSpan.Zero;
            }

            var wait = attempts.BlockedUntil - now;
            return wait > TimeSpan.Zero ? wait : TimeSpan.Zero;
        }
    }

    /// <summary>
    /// Starts an attempt: zero when it may go ahead, counted as a failure until <see cref="RecordSuccess"/> clears it;
    /// otherwise how long the email must wait, and the attempt is not counted.
    /// </summary>
    public TimeSpan Begin(string email)
    {
        var now = _timeProvider.GetUtcNow();
        var attempts = _attempts.GetOrAdd(email, _ => new Attempts());
        lock (attempts)
        {
            if (now - attempts.LastFailureAt > ForgetAfter)
            {
                attempts.Failures = 0;
                attempts.BlockedUntil = DateTimeOffset.MinValue;
            }

            if (attempts.BlockedUntil > now)
            {
                return attempts.BlockedUntil - now;
            }

            attempts.Failures++;
            attempts.LastFailureAt = now;
            if (attempts.Failures >= FreeFailures)
            {
                var doublings = Math.Min(attempts.Failures - FreeFailures, 10);
                var wait = TimeSpan.FromTicks(Math.Min(FirstWait.Ticks << doublings, LongestWait.Ticks));
                attempts.BlockedUntil = now + wait;
            }
        }

        if (_attempts.Count > MaxRemembered)
        {
            Forget(now);
        }

        return TimeSpan.Zero;
    }

    public void RecordSuccess(string email) => _attempts.TryRemove(email, out _);

    /// <summary>
    /// Gives back an attempt that ended without a verdict on the password (the database out of reach, the request
    /// cancelled): it is not a wrong password, so it neither counts nor keeps a wait it alone started.
    /// </summary>
    public void Abandon(string email)
    {
        if (!_attempts.TryGetValue(email, out var attempts))
        {
            return;
        }

        lock (attempts)
        {
            if (attempts.Failures > 0)
            {
                attempts.Failures--;
            }

            if (attempts.Failures < FreeFailures)
            {
                attempts.BlockedUntil = DateTimeOffset.MinValue;
            }
        }
    }

    private void Forget(DateTimeOffset now)
    {
        foreach (var (email, attempts) in _attempts)
        {
            if (now - attempts.LastFailureAt > ForgetAfter)
            {
                _attempts.TryRemove(email, out _);
            }
        }
    }

    private sealed class Attempts
    {
        public int Failures { get; set; }

        public DateTimeOffset LastFailureAt { get; set; }

        public DateTimeOffset BlockedUntil { get; set; }
    }
}
