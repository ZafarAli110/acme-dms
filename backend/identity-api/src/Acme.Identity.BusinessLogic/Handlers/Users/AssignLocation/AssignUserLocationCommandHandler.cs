using Acme.Identity.BusinessLogic.Abstractions.Authorization;
using Acme.Identity.BusinessLogic.Abstractions.Exceptions;
using Acme.Identity.BusinessLogic.Abstractions.Handlers.Users.AssignLocation;
using Acme.Identity.DTO.Users;
using Acme.Identity.Persistence.Database;
using Acme.Identity.Persistence.Entities;
using Acme.Identity.Persistence.Transactions;
using Microsoft.EntityFrameworkCore;

namespace Acme.Identity.BusinessLogic.Handlers.Users.AssignLocation;

/// <summary>
/// Lets a user work at one more location, in the job they already have. Assigning a location they already have
/// changes nothing. The user sees it after their next sign-in: locations travel in the access token.
/// </summary>
internal sealed class AssignUserLocationCommandHandler : IAssignUserLocationCommandHandler
{
    private readonly IdentityDbContext _dbContext;
    private readonly IUnitOfWork _unitOfWork;

    public AssignUserLocationCommandHandler(IdentityDbContext dbContext, IUnitOfWork unitOfWork)
    {
        _dbContext = dbContext;
        _unitOfWork = unitOfWork;
    }

    public async Task<DealerUserResponseDto> ExecuteAsync(UserContext userContext, Guid userId, Guid locationId, CancellationToken cancellationToken)
    {
        var location = await UserLocationRules.LoadLocationAsync(_dbContext, userContext, locationId, cancellationToken);
        await UserLocationRules.EnsureManagesAsync(_dbContext, userContext, location, cancellationToken);
        var user = await UserLocationRules.LoadOtherUserAsync(_dbContext, userContext, userId, cancellationToken);

        // Unassigned locations are soft-deleted rows; assigning one again brings its row back.
        var roles = await _dbContext.UserLocationRoles.IgnoreQueryFilters().Where(r => r.UserId == user.Id).ToListAsync(cancellationToken);
        if (roles.Any(r => r.LocationId == location.Id && !r.IsDeleted))
        {
            return await UserLocationRules.LoadDtoAsync(_dbContext, user.Id, cancellationToken);
        }

        var job = roles.Where(r => !r.IsDeleted).Select(r => r.Role).FirstOrDefault()
            ?? throw new ApiException(ApiErrorCategory.Conflict, $"{user.DisplayName} has no job to give them at {location.Name}.");
        var previous = roles.SingleOrDefault(r => r.LocationId == location.Id);
        if (previous is null)
        {
            _dbContext.UserLocationRoles.Add(new UserLocationRole { UserId = user.Id, LocationId = location.Id, Role = job });
        }
        else
        {
            previous.Role = job;
            previous.IsDeleted = false;
            previous.DeletedAt = null;
            previous.DeletedBy = null;
        }

        await _unitOfWork.SaveChangesAsync(cancellationToken);
        return await UserLocationRules.LoadDtoAsync(_dbContext, user.Id, cancellationToken);
    }
}
