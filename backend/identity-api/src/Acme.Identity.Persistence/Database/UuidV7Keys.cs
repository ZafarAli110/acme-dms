using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata;

namespace Acme.Identity.Persistence.Database;

/// <summary>
/// Primary keys are UUID v7 (time-ordered, so new rows land at the end of the index), assigned by Postgres 18's
/// `uuidv7()` as the column default. Code never sets a key; EF Core reads the new one back after the insert. A key that
/// code does set (the seeded demo data's well-known ids) is inserted as given.
/// </summary>
internal static class UuidV7Keys
{
    public const string DefaultValueSql = "uuidv7()";

    /// <summary>Gives every single-column Guid primary key the database default. Call it last in OnModelCreating.</summary>
    public static void UseDatabaseGeneratedUuidV7Keys(this ModelBuilder modelBuilder)
    {
        foreach (var entityType in modelBuilder.Model.GetEntityTypes())
        {
            if (entityType.FindPrimaryKey() is { Properties: [var key] } && key.ClrType == typeof(Guid))
            {
                key.SetDefaultValueSql(DefaultValueSql);
                key.ValueGenerated = ValueGenerated.OnAdd;
            }
        }
    }
}
