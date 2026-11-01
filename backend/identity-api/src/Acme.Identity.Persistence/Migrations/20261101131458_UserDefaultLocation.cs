using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Acme.Identity.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class UserDefaultLocation : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "default_location_id",
                table: "users",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "ix_users_default_location_id",
                table: "users",
                column: "default_location_id");

            migrationBuilder.AddForeignKey(
                name: "fk_users_locations_default_location_id",
                table: "users",
                column: "default_location_id",
                principalTable: "locations",
                principalColumn: "id",
                onDelete: ReferentialAction.Restrict);

            // Users from before default locations start at the first of their locations by name.
            migrationBuilder.Sql("""
                UPDATE users u SET default_location_id = (
                    SELECT r.location_id FROM user_location_roles r JOIN locations l ON l.id = r.location_id
                    WHERE r.user_id = u.id AND NOT r.is_deleted
                    ORDER BY l.name LIMIT 1)
                WHERE u.default_location_id IS NULL
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "fk_users_locations_default_location_id",
                table: "users");

            migrationBuilder.DropIndex(
                name: "ix_users_default_location_id",
                table: "users");

            migrationBuilder.DropColumn(
                name: "default_location_id",
                table: "users");
        }
    }
}
