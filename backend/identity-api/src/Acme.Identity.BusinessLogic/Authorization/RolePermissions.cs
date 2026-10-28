using static Acme.Identity.BusinessLogic.Authorization.Permissions;

namespace Acme.Identity.BusinessLogic.Authorization;

/// <summary>The single place that decides what each role may do. Tokens carry the resulting permissions.</summary>
public static class RolePermissions
{
    private static readonly Dictionary<string, string[]> PermissionsByRole = new(StringComparer.Ordinal)
    {
        [Roles.DealerAdmin] = [PartsRead, PartsWrite, StockRead, StockAdjust, CustomersRead, CustomersWrite, DocumentsRead, DocumentsWrite, AppointmentsRead, AppointmentsManage, UsersManage],
        [Roles.ServiceManager] = [PartsRead, StockRead, CustomersRead, CustomersWrite, DocumentsRead, DocumentsWrite, AppointmentsRead, AppointmentsManage],
        [Roles.ServiceAdvisor] = [PartsRead, StockRead, CustomersRead, CustomersWrite, DocumentsRead, DocumentsWrite, AppointmentsRead, AppointmentsManage],
        [Roles.Technician] = [PartsRead, StockRead, CustomersRead, DocumentsRead, AppointmentsRead],
        [Roles.PartsManager] = [PartsRead, PartsWrite, StockRead, StockAdjust, CustomersRead, DocumentsRead, DocumentsWrite],
        [Roles.PartsClerk] = [PartsRead, StockRead, StockAdjust, CustomersRead, DocumentsRead],
        [Roles.Sales] = [PartsRead, StockRead, CustomersRead, CustomersWrite, DocumentsRead],
    };

    public static IReadOnlyList<string> For(string role) =>
        PermissionsByRole.TryGetValue(role, out var permissions) ? permissions : [];
}
