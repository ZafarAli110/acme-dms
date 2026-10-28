namespace Acme.Documents.Persistence.Messaging;

/// <summary>Adds a message to the outbox. It is saved with the rest of the unit of work, or not at all.</summary>
public interface IOutbox
{
    void Add<TData>(string type, TData data);
}
