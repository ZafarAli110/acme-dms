using Acme.Documents.Persistence.Auditing;
using Acme.ServiceDefaults.Authorization;

namespace Acme.Documents.Service.Authorization;

/// <summary>The signed-in user on the current request; the system user outside requests (background work).</summary>
internal sealed class HttpCurrentActor : ICurrentActor
{
    private readonly IHttpContextAccessor _httpContextAccessor;

    public HttpCurrentActor(IHttpContextAccessor httpContextAccessor)
    {
        _httpContextAccessor = httpContextAccessor;
    }

    public Guid UserId => _httpContextAccessor.HttpContext.FindUserContext()?.UserId ?? SystemUser.Id;
}
