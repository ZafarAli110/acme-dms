namespace Acme.Documents.Persistence.Database;

/// <summary>
/// The dealer the current request acts for. Every dealer-owned query is filtered by it. When there is no dealer
/// (background work), the filter matches nothing; background code must opt out explicitly with IgnoreQueryFilters().
/// </summary>
public interface IDealerScope
{
    Guid? DealerId { get; }
}
