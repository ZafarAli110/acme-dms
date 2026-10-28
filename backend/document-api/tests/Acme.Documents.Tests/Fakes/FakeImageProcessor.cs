using Acme.Documents.BusinessLogic.Abstractions.ImageProcessing;
using Acme.Documents.DTO.Documents;

namespace Acme.Documents.Tests;

internal sealed class FakeImageProcessor : IImageProcessor
{
    public ProcessedImage Process(ReadOnlyMemory<byte> original, VariantSpecDto variant) => new([1, 2, 3], variant.MaxDimension, variant.MaxDimension / 2);
}
