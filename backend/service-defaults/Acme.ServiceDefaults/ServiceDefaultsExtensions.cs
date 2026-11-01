using Acme.ServiceDefaults.Authorization;
using Acme.ServiceDefaults.Middleware;
using Acme.ServiceDefaults.Observability;
using Acme.ServiceDefaults.ProblemDetails;
using Microsoft.Net.Http.Headers;

namespace Acme.ServiceDefaults;

/// <summary>One call per service wires the shared platform behaviour. Keep service-specific code out of here.</summary>
public static class ServiceDefaultsExtensions
{
    public static WebApplicationBuilder AddServiceDefaults(this WebApplicationBuilder builder)
    {
        ArgumentNullException.ThrowIfNull(builder);

        builder.AddTelemetry();
        builder.Services.AddAcmeProblemDetails();
        builder.Services.AddOpenApi();
        return builder;
    }

    /// <summary>Middleware that must run before the service's own pipeline.</summary>
    public static WebApplication UseServiceDefaults(this WebApplication app)
    {
        ArgumentNullException.ThrowIfNull(app);

        // Every answer is one dealer's data for one signed-in user: no browser, proxy or CDN may keep a copy. An endpoint
        // that can be cached sets its own Cache-Control, and this leaves it alone.
        app.Use((context, next) =>
        {
            context.Response.OnStarting(() =>
            {
                if (!context.Response.Headers.ContainsKey(HeaderNames.CacheControl))
                {
                    context.Response.Headers.CacheControl = "no-store";
                }

                return Task.CompletedTask;
            });
            return next(context);
        });
        app.UseExceptionHandler();
        app.UseStatusCodePages();
        app.UseMiddleware<CorrelationIdMiddleware>();
        return app;
    }

    /// <summary>Authentication, the user context (dealer, location, permissions) and authorization, in that order.</summary>
    public static WebApplication UseAcmeAuthorization(this WebApplication app)
    {
        ArgumentNullException.ThrowIfNull(app);

        app.UseAuthentication();
        app.UseMiddleware<UserContextMiddleware>();
        app.UseAuthorization();
        return app;
    }

    /// <summary>
    /// Endpoints every service exposes: the OpenAPI document and Swagger UI. Each service answers its own
    /// `GET /v1/system/health` (status and version), which Aspire polls.
    /// </summary>
    public static WebApplication MapServiceDefaults(this WebApplication app)
    {
        ArgumentNullException.ThrowIfNull(app);

        app.MapOpenApi().AllowAnonymous();
        app.UseSwaggerUI(options =>
        {
            options.SwaggerEndpoint("/openapi/v1.json", app.Environment.ApplicationName);
            options.RoutePrefix = "swagger";
        });
        return app;
    }
}
