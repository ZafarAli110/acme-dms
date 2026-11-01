using Acme.Identity.BusinessLogic.Authorization;

namespace Acme.Identity.BusinessLogic.Seeding;

/// <summary>
/// The fixed demo tenants, locations and users. Ids never change, so other services' seed data can refer to them.
/// Every demo user's password is <see cref="Password"/>. Development only.
/// </summary>
public static class DemoData
{
    public const string Password = "Acme123!";

    public static readonly Guid NorthwindMotors = Guid.Parse("10000000-0000-0000-0000-000000000001");
    public static readonly Guid CityMotors = Guid.Parse("10000000-0000-0000-0000-000000000002");

    public static readonly Guid Northside = Guid.Parse("20000000-0000-0000-0000-000000000001");
    public static readonly Guid Riverside = Guid.Parse("20000000-0000-0000-0000-000000000002");
    public static readonly Guid Westgate = Guid.Parse("20000000-0000-0000-0000-000000000003");
    public static readonly Guid Central = Guid.Parse("20000000-0000-0000-0000-000000000004");

    public static IReadOnlyList<(Guid Id, string Name)> Dealers { get; } =
    [
        (NorthwindMotors, "Northwind Motors"),
        (CityMotors, "City Motors"),
    ];

    public static IReadOnlyList<(Guid Id, Guid DealerId, string Code, string Name)> Locations { get; } =
    [
        (Northside, NorthwindMotors, "NWM-N", "Northside"),
        (Riverside, NorthwindMotors, "NWM-R", "Riverside"),
        (Westgate, NorthwindMotors, "NWM-W", "Westgate"),
        (Central, CityMotors, "CM-C", "Central"),
    ];

    /// <summary>
    /// A manager who looks after all three rooftops and assigns people to them, and two service advisors who each cover
    /// two rooftops and share Riverside, so everyone can switch location, work handed from one rooftop to another has
    /// someone on both ends, and the manager still has a rooftop to give each advisor. Tom is at another dealer, City
    /// Motors, to show that one dealer never sees another's data.
    /// </summary>
    public static IReadOnlyList<DemoUser> Users { get; } =
    [
        new(Guid.Parse("30000000-0000-0000-0000-000000000002"), NorthwindMotors, "maria@northwind.test", "Maria Service Manager",
            [(Northside, Roles.ServiceManager), (Riverside, Roles.ServiceManager), (Westgate, Roles.ServiceManager)]),
        new(Guid.Parse("30000000-0000-0000-0000-000000000003"), NorthwindMotors, "sam@northwind.test", "Sam Service Advisor",
            [(Northside, Roles.ServiceAdvisor), (Riverside, Roles.ServiceAdvisor)]),
        new(Guid.Parse("30000000-0000-0000-0000-000000000006"), NorthwindMotors, "rita@northwind.test", "Rita Service Advisor",
            [(Riverside, Roles.ServiceAdvisor), (Westgate, Roles.ServiceAdvisor)]),
        // Another dealer: Tom runs City Motors' only rooftop and must never see anything of Northwind's.
        new(Guid.Parse("30000000-0000-0000-0000-000000000007"), CityMotors, "tom@citymotors.test", "Tom Service Manager",
            [(Central, Roles.ServiceManager)]),
    ];

    public sealed record DemoUser(Guid Id, Guid DealerId, string Email, string DisplayName, IReadOnlyList<(Guid LocationId, string Role)> Roles);
}
