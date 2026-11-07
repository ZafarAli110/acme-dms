using Acme.Documents.BusinessLogic.Abstractions.Handlers.Documents.Sweep;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace Acme.Documents.Messaging.Sweeping;

/// <summary>Runs the document sweep once a minute, in every instance: each document is failed once, under its row version.</summary>
public sealed partial class DocumentSweeper : BackgroundService
{
    private static readonly TimeSpan _every = TimeSpan.FromMinutes(1);

    private readonly IServiceScopeFactory _scopeFactory;
    private readonly TimeProvider _timeProvider;
    private readonly ILogger<DocumentSweeper> _logger;

    public DocumentSweeper(IServiceScopeFactory scopeFactory, TimeProvider timeProvider, ILogger<DocumentSweeper> logger)
    {
        _scopeFactory = scopeFactory;
        _timeProvider = timeProvider;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            await Task.Delay(_every, _timeProvider, stoppingToken);
            try
            {
                using var scope = _scopeFactory.CreateScope();
                var failed = await scope.ServiceProvider.GetRequiredService<ISweepDocumentsCommandHandler>().ExecuteAsync(stoppingToken);
                if (failed > 0)
                {
                    LogTimedOut(_logger, failed);
                }
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                LogSweepFailed(_logger, ex);
            }
        }
    }

    [LoggerMessage(Level = LogLevel.Warning, Message = "Failed {Count} documents still pending after the deadline: their processing never finished")]
    private static partial void LogTimedOut(ILogger logger, int count);

    [LoggerMessage(Level = LogLevel.Error, Message = "Sweeping documents failed; the next sweep tries again")]
    private static partial void LogSweepFailed(ILogger logger, Exception exception);
}
