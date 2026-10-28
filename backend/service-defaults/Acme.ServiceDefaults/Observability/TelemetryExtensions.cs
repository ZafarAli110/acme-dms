using System.Diagnostics;
using Npgsql;
using OpenTelemetry;
using OpenTelemetry.Metrics;
using OpenTelemetry.Trace;

namespace Acme.ServiceDefaults.Observability;

/// <summary>
/// Sends traces, metrics and logs to the OTLP endpoint Aspire provides (OTEL_EXPORTER_OTLP_ENDPOINT).
/// The service name comes from OTEL_SERVICE_NAME, which Aspire sets to the resource name.
/// </summary>
public static class TelemetryExtensions
{
    public static WebApplicationBuilder AddTelemetry(this WebApplicationBuilder builder)
    {
        ArgumentNullException.ThrowIfNull(builder);

        builder.Logging.AddOpenTelemetry(logging =>
        {
            logging.IncludeFormattedMessage = true;
            logging.IncludeScopes = true;
        });

        var otel = builder.Services.AddOpenTelemetry()
            .WithTracing(tracing => tracing
                .AddAspNetCoreInstrumentation()
                .AddHttpClientInstrumentation(options => options.EnrichWithHttpResponseMessage = MarkOnlyServerErrorsAsFailed)
                .AddNpgsql()
                .AddSource("Acme.*")
                .AddSource("RabbitMQ.Client.*"))
            .WithMetrics(metrics => metrics
                .AddAspNetCoreInstrumentation()
                .AddHttpClientInstrumentation()
                .AddRuntimeInstrumentation());

        if (!string.IsNullOrWhiteSpace(builder.Configuration["OTEL_EXPORTER_OTLP_ENDPOINT"]))
        {
            otel.UseOtlpExporter();
        }

        return builder;
    }

    /// <summary>
    /// The HTTP conventions mark every 4xx answer as an error on the calling side, so each expected 401, 403 or 404
    /// that passes through the gateway would show up as a failed trace. Only 5xx (and network failures, which never
    /// reach this point) are failures of the system; a 4xx is the service answering correctly.
    /// </summary>
    private static void MarkOnlyServerErrorsAsFailed(Activity activity, HttpResponseMessage response)
    {
        if ((int)response.StatusCode < 500)
        {
            activity.SetStatus(ActivityStatusCode.Unset);
            activity.SetTag("error.type", null);
        }
    }
}
