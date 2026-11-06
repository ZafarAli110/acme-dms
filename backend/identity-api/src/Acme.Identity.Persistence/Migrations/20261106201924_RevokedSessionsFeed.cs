using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Acme.Identity.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class RevokedSessionsFeed : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateIndex(
                name: "ix_refresh_tokens_revoked_at",
                table: "refresh_tokens",
                column: "revoked_at",
                filter: "revoked_at IS NOT NULL");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "ix_refresh_tokens_revoked_at",
                table: "refresh_tokens");
        }
    }
}
