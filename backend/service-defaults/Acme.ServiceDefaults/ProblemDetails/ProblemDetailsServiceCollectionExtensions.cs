using Microsoft.AspNetCore.Http;

namespace Acme.ServiceDefaults.ProblemDetails;

public static class ProblemDetailsServiceCollectionExtensions
{
    public static IServiceCollection AddAcmeProblemDetails(this IServiceCollection services)
    {
        // Registered before AddProblemDetails so it is the writer the framework picks.
        services.AddSingleton<IProblemDetailsWriter, AcmeProblemDetailsWriter>();
        return services.AddProblemDetails();
    }
}
