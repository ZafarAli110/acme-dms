using Acme.Gateway.Service;

namespace Acme.Gateway.Tests;

[TestClass]
public sealed class LocationPrefixTests
{
    [TestMethod]
    public void Apply_PutsTheRoutePrefixBackOnAServiceRelativeLocation() =>
        Assert.AreEqual("/api/dealership/v1/customers/42", LocationPrefix.Apply("/api/dealership", "/v1/customers/42"));

    [TestMethod]
    public void Apply_LeavesAnAbsoluteOrAlreadyPrefixedLocationAlone()
    {
        Assert.AreEqual("https://example.test/v1/x", LocationPrefix.Apply("/api/dealership", "https://example.test/v1/x"));
        Assert.AreEqual("//example.test/v1/x", LocationPrefix.Apply("/api/dealership", "//example.test/v1/x"));
        Assert.AreEqual("/api/dealership/v1/x", LocationPrefix.Apply("/api/dealership", "/api/dealership/v1/x"));
    }
}
