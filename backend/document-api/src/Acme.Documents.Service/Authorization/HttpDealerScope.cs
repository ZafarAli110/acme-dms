using Acme.ServiceDefaults.Authorization;
using Acme.Documents.Persistence.Database;

namespace Acme.Documents.Service.Authorization;

/// <summary>The dealer of the signed-in user on the current request; null outside requests (background work).</summary>
internal sealed class HttpDealerScope : IDealerScope
{
    private readonly IHttpContextAccessor _httpContextAccessor;

    public HttpDealerScope(IHttpContextAccessor httpContextAccessor)
    {
        _httpContextAccessor = httpContextAccessor;
    }

    public Guid? DealerId => _httpContextAccessor.HttpContext.FindUserContext()?.DealerId;
}
