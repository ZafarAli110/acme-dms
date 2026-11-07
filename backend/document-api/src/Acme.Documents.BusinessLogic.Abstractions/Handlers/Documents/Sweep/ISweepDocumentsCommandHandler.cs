namespace Acme.Documents.BusinessLogic.Abstractions.Handlers.Documents.Sweep;

/// <summary>
/// The way out of <c>Pending</c> when processing never finishes: a document pending past its deadline is failed, and its
/// <c>document.failed</c> event goes out. Also forgets outbox messages published long ago.
/// </summary>
public interface ISweepDocumentsCommandHandler
{
    /// <summary>Returns how many documents were failed.</summary>
    Task<int> ExecuteAsync(CancellationToken cancellationToken);
}
