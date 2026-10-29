using Acme.Identity.BusinessLogic.Abstractions.Authorization;
using Acme.Identity.BusinessLogic.Abstractions.Handlers.Locations.GetList;
using Acme.Identity.DTO.Locations;
using Acme.Identity.Persistence.Database;
using Microsoft.EntityFrameworkCore;

namespace Acme.Identity.BusinessLogic.Handlers.Locations.GetList;

/// <summary>The caller's dealer's locations, by name.</summary>
internal sealed class GetLocationsQueryHandler : IGetLocationsQueryHandler
{
    private readonly IdentityDbContext _dbContext;

    public GetLocationsQueryHandler(IdentityDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    public async Task<IReadOnlyList<LocationResponseDto>> ExecuteAsync(UserContext userContext, CancellationToken cancellationToken) =>
        await _dbContext.Locations
            .Where(l => l.DealerId == userContext.DealerId)
            .OrderBy(l => l.Name)
            .Select(l => new LocationResponseDto(l.Id, l.Code, l.Name))
            .ToListAsync(cancellationToken);
}
