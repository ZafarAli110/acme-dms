using Acme.Identity.BusinessLogic.Abstractions.Authorization;
using Acme.Identity.BusinessLogic.Abstractions.Exceptions;
using Acme.Identity.BusinessLogic.Abstractions.Handlers.Users.UnassignLocation;
using Acme.Identity.DTO.Users;
using Acme.Identity.Persistence.Database;
using Acme.Identity.Persistence.Transactions;
using Microsoft.EntityFrameworkCore;

namespace Acme.Identity.BusinessLogic.Handlers.Users.UnassignLocation;

/// <summary>
/// Takes a location away from a user. Their last location is refused: a user with none can't sign in to anything.
/// Unassigning a location they don't have changes nothing.
/// </summary>
internal sealed class UnassignUserLocationCommandHandler : IUnassignUserLocationCommandHandler
{
    private readonly IdentityDbContext _dbContext;
    private readonly IUnitOfWork _unitOfWork;

    public UnassignUserLocationCommandHandler(IdentityDbContext dbContext, IUnitOfWork unitOfWork)
    {
        _dbContext = dbContext;
        _unitOfWork = unitOfWork;
    }

    public async Task<DealerUserResponseDto> ExecuteAsync(UserContext userContext, Guid userId, Guid locationId, CancellationToken cancellationToken)
    {
        var location = await UserLocationRules.LoadLocationAsync(_dbContext, userContext, locationId, cancellationToken);
        await UserLocationRules.EnsureManagesAsync(_dbContext, userContext, location, cancellationToken);
        var user = await UserLocationRules.LoadOtherUserAsync(_dbContext, userContext, userId, cancellationToken);

        var roles = await _dbContext.UserLocationRoles.Where(r => r.UserId == user.Id).ToListAsync(cancellationToken);
        var role = roles.SingleOrDefault(r => r.LocationId == location.Id);
        if (role is null)
        {
            return await UserLocationRules.LoadDtoAsync(_dbContext, user.Id, cancellationToken);
        }

        if (roles.Count == 1)
        {
            throw new ApiException(ApiErrorCategory.Conflict, $"{user.DisplayName} must keep at least one location.");
        }

        // A soft delete (AuditingInterceptor): who unassigned it and when stays on the row.
        _dbContext.UserLocationRoles.Remove(role);
        await _unitOfWork.SaveChangesAsync(cancellationToken);
        return await UserLocationRules.LoadDtoAsync(_dbContext, user.Id, cancellationToken);
    }
}
