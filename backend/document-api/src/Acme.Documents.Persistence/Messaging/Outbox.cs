using System.Diagnostics;
using System.Text.Json;
using Acme.Documents.Persistence.Entities;
using Acme.Documents.Persistence.Database;

namespace Acme.Documents.Persistence.Messaging;

internal sealed class Outbox : IOutbox
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    private readonly DocumentsDbContext _dbContext;
    private readonly TimeProvider _timeProvider;

    public Outbox(DocumentsDbContext dbContext, TimeProvider timeProvider)
    {
        _dbContext = dbContext;
        _timeProvider = timeProvider;
    }

    public void Add<TData>(string type, TData data) =>
        _dbContext.OutboxMessages.Add(new OutboxMessage
        {
            Id = Guid.NewGuid(),
            Type = type,
            Payload = JsonSerializer.Serialize(data, JsonOptions),
            TraceParent = Activity.Current?.Id,
            OccurredAt = _timeProvider.GetUtcNow(),
        });
}
