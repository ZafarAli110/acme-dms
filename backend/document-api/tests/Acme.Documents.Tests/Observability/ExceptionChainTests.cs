using Acme.ServiceDefaults.Observability;

namespace Acme.Documents.Tests.Observability;

[TestClass]
public sealed class ExceptionChainTests
{
    [TestMethod]
    public void Describe_ListsTheExceptionAndItsCauses()
    {
        var exception = new InvalidOperationException("saving failed", new TimeoutException("no answer"));

        Assert.AreEqual("InvalidOperationException: saving failed -> TimeoutException: no answer", ExceptionChain.Describe(exception));
    }

    [TestMethod]
    public void Describe_StopsAfterMaxCauseDepthCauses()
    {
        Exception exception = new InvalidOperationException("level 5");
        for (var level = 4; level >= 0; level--)
        {
            exception = new InvalidOperationException($"level {level}", exception);
        }

        var parts = ExceptionChain.Describe(exception).Split(" -> ");

        // The exception itself, MaxCauseDepth causes, then the marker instead of the rest.
        Assert.HasCount(ExceptionChain.MaxCauseDepth + 2, parts);
        Assert.AreEqual("InvalidOperationException: level 3", parts[ExceptionChain.MaxCauseDepth]);
        Assert.AreEqual(ExceptionChain.DepthReached, parts[^1]);
    }

    [TestMethod]
    public void Describe_DoesNotMarkAChainThatFitsInTheDepth()
    {
        Exception exception = new InvalidOperationException("level 3");
        for (var level = 2; level >= 0; level--)
        {
            exception = new InvalidOperationException($"level {level}", exception);
        }

        Assert.DoesNotContain(ExceptionChain.DepthReached, ExceptionChain.Describe(exception));
    }
}
