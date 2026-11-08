using System.Net;
using Acme.Identity.Service;
using Microsoft.Extensions.Configuration;

namespace Acme.Identity.Tests;

/// <summary>Who the per-address limits count (an IPv4 address, or an IPv6 network of /64), and how many sign-ins each gets.</summary>
[TestClass]
public sealed class RateLimitsTests
{
    [TestMethod]
    public void AddressKey_CountsAnIPv6AddressByItsSlash64()
    {
        var one = RateLimits.AddressKey(IPAddress.Parse("2001:db8:1:2:aaaa:bbbb:cccc:dddd"));
        var another = RateLimits.AddressKey(IPAddress.Parse("2001:db8:1:2:1:2:3:4"));
        var elsewhere = RateLimits.AddressKey(IPAddress.Parse("2001:db8:1:3::1"));

        Assert.AreEqual("2001:db8:1:2::/64", one);
        Assert.AreEqual(one, another, "one network cannot switch addresses to get more tries");
        Assert.AreNotEqual(one, elsewhere);
    }

    [TestMethod]
    public void AddressKey_CountsAnIPv4AddressAsItIs_ThePlainOrTheMappedForm()
    {
        Assert.AreEqual("203.0.113.7", RateLimits.AddressKey(IPAddress.Parse("203.0.113.7")));
        Assert.AreEqual("203.0.113.7", RateLimits.AddressKey(IPAddress.Parse("::ffff:203.0.113.7")));
        Assert.AreEqual("unknown", RateLimits.AddressKey(null));
    }

    [TestMethod]
    public void SignInPerMinute_IsTen_UnlessAPositiveNumberIsSet()
    {
        Assert.AreEqual(10, RateLimits.SignInPerMinute(Settings(null)));
        Assert.AreEqual(5000, RateLimits.SignInPerMinute(Settings("5000")), "a load test raises it");
        Assert.AreEqual(10, RateLimits.SignInPerMinute(Settings("0")), "zero would stop every sign-in");
        Assert.AreEqual(10, RateLimits.SignInPerMinute(Settings("-1")));
    }

    private static IConfiguration Settings(string? signInPerMinute) =>
        new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?> { ["RateLimits:SignInPerMinute"] = signInPerMinute })
            .Build();
}
