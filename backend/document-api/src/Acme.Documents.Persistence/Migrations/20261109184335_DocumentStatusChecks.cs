using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Acme.Documents.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class DocumentStatusChecks : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddCheckConstraint(
                name: "ck_documents_outcome",
                table: "documents",
                sql: "(status = 'Pending') = (processed_at IS NULL) AND (status = 'Failed') = (failure_reason IS NOT NULL)");

            migrationBuilder.AddCheckConstraint(
                name: "ck_documents_status",
                table: "documents",
                sql: "status IN ('Pending', 'Ready', 'Failed')");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "ck_documents_outcome",
                table: "documents");

            migrationBuilder.DropCheckConstraint(
                name: "ck_documents_status",
                table: "documents");
        }
    }
}
