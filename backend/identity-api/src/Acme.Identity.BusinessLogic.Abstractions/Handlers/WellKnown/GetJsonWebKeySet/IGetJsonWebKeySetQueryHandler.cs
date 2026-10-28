using Acme.Identity.DTO.WellKnown;

namespace Acme.Identity.BusinessLogic.Abstractions.Handlers.WellKnown.GetJsonWebKeySet;

public interface IGetJsonWebKeySetQueryHandler
{
    Task<JsonWebKeySetDto> ExecuteAsync(CancellationToken cancellationToken);
}
