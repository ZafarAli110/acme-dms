using System.Security.Claims;

namespace Acme.ServiceDefaults.Authentication;

public static class ClaimsPrincipalExtensions
{
    public static Guid GetUserId(this ClaimsPrincipal principal)
    {
        ArgumentNullException.ThrowIfNull(principal);
        return Guid.TryParse(principal.FindFirst("sub")?.Value, out var userId)
            ? userId
            : throw new InvalidOperationException("The token has no valid 'sub' claim.");
    }

    public static Guid GetDealerId(this ClaimsPrincipal principal)
    {
        ArgumentNullException.ThrowIfNull(principal);
        return Guid.TryParse(principal.FindFirst("dealer_id")?.Value, out var dealerId)
            ? dealerId
            : throw new InvalidOperationException("The token has no valid 'dealer_id' claim.");
    }
}
