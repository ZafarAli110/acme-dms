using Acme.Identity.BusinessLogic.Abstractions.Authorization;
using Acme.Identity.BusinessLogic.Abstractions.Exceptions;
using Acme.Identity.BusinessLogic.Authorization;
using Acme.Identity.DTO.Users;
using Acme.Identity.Persistence.Database;
using Acme.Identity.Persistence.Entities;
using Microsoft.EntityFrameworkCore;

namespace Acme.Identity.BusinessLogic.Handlers.Users;

/// <summary>What a manager may do to another user's locations, shared by assigning and unassigning.</summary>
internal static class UserLocationRules
{
    /// <summary>The caller's dealer's location; another dealer's location is "not found", not "forbidden".</summary>
    public static async Task<Location> LoadLocationAsync(IdentityDbContext dbContext, UserContext userContext, Guid locationId, CancellationToken cancellationToken) =>
        await dbContext.Locations.SingleOrDefaultAsync(l => l.Id == locationId && l.DealerId == userContext.DealerId, cancellationToken)
        ?? throw new ApiException(ApiErrorCategory.NotFound, $"Location {locationId} was not found.");

    /// <summary>A manager assigns people only to the locations they manage themselves.</summary>
    public static async Task EnsureManagesAsync(IdentityDbContext dbContext, UserContext userContext, Location location, CancellationToken cancellationToken)
    {
        var role = await dbContext.UserLocationRoles
            .Where(r => r.UserId == userContext.UserId && r.LocationId == location.Id)
            .Select(r => r.Role)
            .SingleOrDefaultAsync(cancellationToken);
        if (role is null || !RolePermissions.For(role).Contains(Permissions.UsersManage, StringComparer.Ordinal))
        {
            throw new ApiException(ApiErrorCategory.Forbidden, $"You do not manage {location.Name}.");
        }
    }

    /// <summary>
    /// Another user of the caller's dealer. Changing your own locations is refused: a manager who unassigns their own
    /// location locks themselves out of it.
    /// </summary>
    public static async Task<User> LoadOtherUserAsync(IdentityDbContext dbContext, UserContext userContext, Guid userId, CancellationToken cancellationToken)
    {
        var user = await dbContext.Users.SingleOrDefaultAsync(u => u.Id == userId && u.DealerId == userContext.DealerId, cancellationToken)
            ?? throw new ApiException(ApiErrorCategory.NotFound, $"User {userId} was not found.");
        if (user.Id == userContext.UserId)
        {
            throw new ApiException(ApiErrorCategory.Forbidden, "You cannot change your own locations.");
        }

        return user;
    }

    public static async Task<DealerUserResponseDto> LoadDtoAsync(IdentityDbContext dbContext, Guid userId, CancellationToken cancellationToken)
    {
        var user = await dbContext.Users
            .Include(u => u.LocationRoles)
            .AsNoTracking()
            .SingleAsync(u => u.Id == userId, cancellationToken);
        return ToDto(user);
    }

    /// <summary>A user holds one role (their job) at each of their locations.</summary>
    public static DealerUserResponseDto ToDto(User user) =>
        new(
            user.Id,
            user.Email,
            user.DisplayName,
            user.LocationRoles.Select(r => r.Role).FirstOrDefault() ?? string.Empty,
            user.LocationRoles.Select(r => r.LocationId).Order().ToList());
}
