using Microsoft.AspNetCore.Diagnostics;

namespace Acme.ServiceDefaults.DatabaseErrors;

public static class DatabaseErrorServiceCollectionExtensions
{
    /// <summary>
    /// Maps Postgres failures to problem details (<see cref="PostgresErrorMapper"/>). Call it after the service's own
    /// <see cref="IExceptionHandler"/>: handlers run in the order they are added, and a handler's ApiException that
    /// wraps a database error must win.
    /// </summary>
    public static IServiceCollection AddAcmeDatabaseErrors(this IServiceCollection services, Action<DatabaseErrorOptions>? configure = null)
    {
        var options = services.AddOptions<DatabaseErrorOptions>();
        if (configure is not null)
        {
            options.Configure(configure);
        }

        services.AddExceptionHandler<DatabaseExceptionHandler>();
        return services;
    }
}
