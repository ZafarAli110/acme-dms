using Acme.Identity.BusinessLogic.Abstractions.Handlers.Users.GetCurrent;
using Acme.Identity.DTO.Users;
using Microsoft.EntityFrameworkCore;
using Acme.Identity.BusinessLogic.Abstractions.Exceptions;
using Acme.Identity.Persistence.Database;

namespace Acme.Identity.BusinessLogic.Handlers.Users.GetCurrent;

internal sealed class GetCurrentUserQueryHandler : IGetCurrentUserQueryHandler
{
    private readonly IdentityDbContext _dbContext;

    public GetCurrentUserQueryHandler(IdentityDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    public async Task<CurrentUserResponseDto> ExecuteAsync(Guid userId, CancellationToken cancellationToken)
    {
        var user = await _dbContext.Users
            .Include(u => u.Dealer)
            .Include(u => u.LocationRoles).ThenInclude(r => r.Location)
            .AsNoTracking()
            .SingleOrDefaultAsync(u => u.Id == userId, cancellationToken)
            .ConfigureAwait(false)
            ?? throw new ApiException(ApiErrorCategory.NotFound, $"User {userId} was not found.");

        return new CurrentUserResponseDto(
            user.Id,
            user.Email,
            user.DisplayName,
            user.DealerId,
            user.Dealer?.Name ?? string.Empty,
            UserLocationMapper.ToUserLocationDtos(user));
    }
}
