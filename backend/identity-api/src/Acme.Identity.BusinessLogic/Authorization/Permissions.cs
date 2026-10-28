namespace Acme.Identity.BusinessLogic.Authorization;

/// <summary>What services check. Code checks permissions, never role names.</summary>
public static class Permissions
{
    public const string PartsRead = "parts.read";
    public const string PartsWrite = "parts.write";
    public const string StockRead = "stock.read";
    public const string StockAdjust = "stock.adjust";
    public const string CustomersRead = "customers.read";
    public const string CustomersWrite = "customers.write";
    public const string DocumentsRead = "documents.read";
    public const string DocumentsWrite = "documents.write";
    public const string AppointmentsRead = "appointments.read";
    public const string AppointmentsManage = "appointments.manage";
    public const string UsersManage = "users.manage";
}
