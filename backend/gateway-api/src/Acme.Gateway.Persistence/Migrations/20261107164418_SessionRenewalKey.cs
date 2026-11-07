using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Acme.Gateway.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class SessionRenewalKey : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "renewal_key",
                table: "sessions",
                type: "text",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "renewal_key",
                table: "sessions");
        }
    }
}
