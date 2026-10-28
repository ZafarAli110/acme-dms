using Acme.Documents.BusinessLogic.Abstractions.ImageProcessing;
using Acme.Documents.DTO.Documents;
using NetVips;

namespace Acme.Documents.BusinessLogic.ImageProcessing;

/// <summary>libvips (the engine behind Sharp): shrink to fit within MaxDimension, never enlarge, encode as WebP.</summary>
internal sealed class NetVipsImageProcessor : IImageProcessor
{
    public ProcessedImage Process(ReadOnlyMemory<byte> original, VariantSpecDto variant)
    {
        ArgumentNullException.ThrowIfNull(variant);

        using var image = Image.ThumbnailBuffer(original.ToArray(), variant.MaxDimension, height: variant.MaxDimension, size: Enums.Size.Down);
        var data = image.WebpsaveBuffer(q: variant.Quality);
        return new ProcessedImage(data, image.Width, image.Height);
    }
}
