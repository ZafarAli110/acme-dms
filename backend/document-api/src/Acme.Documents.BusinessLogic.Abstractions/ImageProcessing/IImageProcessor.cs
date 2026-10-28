using Acme.Documents.DTO.Documents;

namespace Acme.Documents.BusinessLogic.Abstractions.ImageProcessing;

/// <summary>Images only: resizes and re-encodes as WebP. No validation; callers validate first.</summary>
public interface IImageProcessor
{
    ProcessedImage Process(ReadOnlyMemory<byte> original, VariantSpecDto variant);
}

public sealed record ProcessedImage(byte[] Data, int Width, int Height);
