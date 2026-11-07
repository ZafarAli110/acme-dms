using Acme.Documents.DTO.Messages;

namespace Acme.Documents.BusinessLogic.Abstractions.Handlers.Documents.ForgetUnclaimed;

/// <summary>
/// Deletes a document no record claimed (<c>document.unclaimed.v1</c> from the owning service): its upload was stored here
/// and its record was never saved there. Safe to receive twice, or for a document already deleted.
/// </summary>
public interface IForgetUnclaimedDocumentCommandHandler
{
    Task ExecuteAsync(ProcessDocumentMessageDto message, CancellationToken cancellationToken);
}
