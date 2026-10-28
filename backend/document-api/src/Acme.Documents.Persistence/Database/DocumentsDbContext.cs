using Acme.Documents.Persistence.Entities;
using Microsoft.EntityFrameworkCore;

namespace Acme.Documents.Persistence.Database;

/// <summary>EF Core context for the documents database.</summary>
public sealed class DocumentsDbContext : DbContext
{
    private readonly Guid? _dealerId;

    public DocumentsDbContext(DbContextOptions<DocumentsDbContext> options, IDealerScope dealerScope)
        : base(options)
    {
        ArgumentNullException.ThrowIfNull(dealerScope);
        _dealerId = dealerScope.DealerId;
    }

    public DbSet<Document> Documents => Set<Document>();

    public DbSet<DocumentContent> DocumentContents => Set<DocumentContent>();

    public DbSet<OutboxMessage> OutboxMessages => Set<OutboxMessage>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        ArgumentNullException.ThrowIfNull(modelBuilder);

        modelBuilder.Entity<Document>(document =>
        {
            document.Property(d => d.OwnerType).HasMaxLength(50);
            document.Property(d => d.OriginalFileName).HasMaxLength(255);
            document.Property(d => d.ContentType).HasMaxLength(100);
            document.Property(d => d.Status).HasConversion<string>().HasMaxLength(20);
            document.Property(d => d.FailureReason).HasMaxLength(1000);
            document.Property(d => d.RequestedVariants).HasColumnType("jsonb");
            document.HasIndex(d => new { d.DealerId, d.OwnerType, d.OwnerId });

            document.ToTable(table => table.HasCheckConstraint(
                "ck_documents_deleted",
                "is_deleted = (deleted_at IS NOT NULL) AND is_deleted = (deleted_by IS NOT NULL)"));

            // Tenant isolation and soft delete, for every query: a request only ever sees its own dealer's documents,
            // and never a deleted one.
            document.HasQueryFilter(d => d.DealerId == _dealerId && !d.IsDeleted);
        });

        modelBuilder.Entity<DocumentContent>(content =>
        {
            content.HasKey(c => new { c.DocumentId, c.Name });
            content.Property(c => c.Name).HasMaxLength(50);
            content.Property(c => c.ContentType).HasMaxLength(100);
            content.HasOne<Document>().WithMany(d => d.Contents).HasForeignKey(c => c.DocumentId);
        });

        modelBuilder.Entity<OutboxMessage>(message =>
        {
            message.Property(m => m.Type).HasMaxLength(100);
            message.Property(m => m.Payload).HasColumnType("jsonb");
            message.Property(m => m.TraceParent).HasMaxLength(100);
            message.HasIndex(m => m.PublishedAt);
        });
    }
}
