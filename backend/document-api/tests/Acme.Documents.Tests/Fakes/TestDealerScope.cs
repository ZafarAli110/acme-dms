using Acme.Documents.Persistence.Database;

namespace Acme.Documents.Tests;

internal sealed class TestDealerScope : IDealerScope
{
    public TestDealerScope(Guid? dealerId)
    {
        DealerId = dealerId;
    }

    public Guid? DealerId { get; }
}
