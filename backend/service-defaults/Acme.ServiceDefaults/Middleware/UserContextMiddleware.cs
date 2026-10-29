using System.Text.Json;
using Acme.ServiceDefaults.Authentication;
using Acme.ServiceDefaults.Authorization;
using Acme.ServiceDefaults.ProblemDetails;

namespace Acme.ServiceDefaults.Middleware;

/// <summary>
/// For authenticated requests: reads the selected location from <c>x-location-id</c>, refuses locations the token does
/// not grant, and stores the resulting <see cref="AcmeUserContext"/> for the rest of the request.
/// </summary>
public sealed class UserContextMiddleware
{
    public const string LocationHeader = "x-location-id";
    internal const string ItemKey = "acme:user-context";

    private readonly RequestDelegate _next;

    public UserContextMiddleware(RequestDelegate next)
    {
        _next = next;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        ArgumentNullException.ThrowIfNull(context);

        if (context.User.Identity?.IsAuthenticated != true)
        {
            await _next(context);
            return;
        }

        var locations = ReadLocations(context.User.FindAll("locations").Select(claim => claim.Value));
        var header = context.Request.Headers[LocationHeader].FirstOrDefault();
        Guid? locationId = null;
        IReadOnlyList<string> permissions = [];

        if (!string.IsNullOrWhiteSpace(header))
        {
            if (!Guid.TryParse(header, out var requested) || !locations.TryGetValue(requested, out var granted))
            {
                var problem = ProblemDetailsDtoFactory.Create(context, StatusCodes.Status403Forbidden, $"You do not work at location {header}.");
                context.Response.StatusCode = StatusCodes.Status403Forbidden;
                await context.Response.WriteAsJsonAsync(problem, (JsonSerializerOptions?)null, "application/problem+json");
                return;
            }

            locationId = requested;
            permissions = granted;
        }

        context.Items[ItemKey] = new AcmeUserContext(context.User.GetUserId(), context.User.GetDealerId(), locationId, permissions);
        await _next(context);
    }

    /// <summary>
    /// The JWT handler turns the <c>locations</c> array into one claim per location (each a JSON object); a token
    /// read another way may carry the whole array in one claim. Both shapes are accepted.
    /// </summary>
    private static Dictionary<Guid, IReadOnlyList<string>> ReadLocations(IEnumerable<string> claimValues)
    {
        var result = new Dictionary<Guid, IReadOnlyList<string>>();
        foreach (var json in claimValues)
        {
            using var document = JsonDocument.Parse(json);
            var locations = document.RootElement.ValueKind == JsonValueKind.Array
                ? document.RootElement.EnumerateArray().ToList()
                : [document.RootElement];
            foreach (var location in locations)
            {
                var id = location.GetProperty("id").GetGuid();
                result[id] = location.GetProperty("permissions").EnumerateArray().Select(p => p.GetString() ?? string.Empty).ToList();
            }
        }

        return result;
    }
}
