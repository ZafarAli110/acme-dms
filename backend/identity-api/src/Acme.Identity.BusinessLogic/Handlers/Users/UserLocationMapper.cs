using Acme.Identity.BusinessLogic.Authorization;
using Acme.Identity.DTO.Users;
using Acme.Identity.Persistence.Entities;

namespace Acme.Identity.BusinessLogic.Handlers.Users;

internal static class UserLocationMapper
{
    public static List<UserLocationDto> ToUserLocationDtos(User user) =>
        user.LocationRoles
            .Where(role => role.Location is not null)
            .OrderBy(role => role.Location!.Name, StringComparer.Ordinal)
            .Select(role => new UserLocationDto(role.LocationId, role.Location!.Code, role.Location.Name, role.Role, RolePermissions.For(role.Role)))
            .ToList();
}
