using Acme.Identity.BusinessLogic.Authorization;

namespace Acme.Identity.Tests.Authorization;

[TestClass]
public sealed class RolePermissionsTests
{
    [TestMethod]
    public void For_GivesDealerAdminEveryPermission()
    {
        var all = typeof(Permissions).GetFields().Select(f => (string)f.GetRawConstantValue()!).ToList();

        CollectionAssert.AreEquivalent(all, RolePermissions.For(Roles.DealerAdmin).ToList());
    }

    [TestMethod]
    public void For_LetsPartsClerkAdjustStockButNotEditTheCatalogue()
    {
        var permissions = RolePermissions.For(Roles.PartsClerk);

        CollectionAssert.Contains(permissions.ToList(), Permissions.StockAdjust);
        CollectionAssert.DoesNotContain(permissions.ToList(), Permissions.PartsWrite);
    }

    [TestMethod]
    public void For_LetsPartsClerkLookUpCustomersButNotChangeThem()
    {
        var permissions = RolePermissions.For(Roles.PartsClerk);

        CollectionAssert.Contains(permissions.ToList(), Permissions.CustomersRead);
        CollectionAssert.DoesNotContain(permissions.ToList(), Permissions.CustomersWrite);
    }

    [TestMethod]
    public void For_LetsAServiceManagerAssignPeopleToLocationsButNotAServiceAdvisor()
    {
        CollectionAssert.Contains(RolePermissions.For(Roles.ServiceManager).ToList(), Permissions.UsersManage);
        CollectionAssert.DoesNotContain(RolePermissions.For(Roles.ServiceAdvisor).ToList(), Permissions.UsersManage);
    }

    [TestMethod]
    public void For_GivesAnUnknownRoleNoPermissions() => Assert.AreEqual(0, RolePermissions.For("Janitor").Count);
}
