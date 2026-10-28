namespace Acme.Identity.BusinessLogic.Authorization;

/// <summary>Dealership roles. A user holds one role per location.</summary>
public static class Roles
{
    public const string DealerAdmin = "DealerAdmin";
    public const string ServiceManager = "ServiceManager";
    public const string ServiceAdvisor = "ServiceAdvisor";
    public const string Technician = "Technician";
    public const string PartsManager = "PartsManager";
    public const string PartsClerk = "PartsClerk";
    public const string Sales = "Sales";
}
