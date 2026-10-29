using Acme.Identity.BusinessLogic.Abstractions.Authorization;
using Acme.Identity.BusinessLogic.Abstractions.Handlers.Users.GetList;
using Acme.Identity.DTO.Users;
using Acme.Identity.Persistence.Database;
using Microsoft.EntityFrameworkCore;

namespace Acme.Identity.BusinessLogic.Handlers.Users.GetList;

/// <summary>Everyone at the caller's dealer, with the locations they work at: what the Locations page shows.</summary>
internal sealed class GetUsersQueryHandler : IGetUsersQueryHandler
{
    private readonly IdentityDbContext _dbContext;

    public GetUsersQueryHandler(IdentityDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    public async Task<IReadOnlyList<DealerUserResponseDto>> ExecuteAsync(UserContext userContext, CancellationToken cancellationToken)
    {
        var users = await _dbContext.Users
            .Include(u => u.LocationRoles)
            .Where(u => u.DealerId == userContext.DealerId)
            .OrderBy(u => u.DisplayName)
            .AsNoTracking()
            .ToListAsync(cancellationToken);
        return users.Select(UserLocationRules.ToDto).ToList();
    }
}
