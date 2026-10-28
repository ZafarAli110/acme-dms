using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Acme.Identity.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AuditColumns : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "ix_users_email",
                table: "users");

            migrationBuilder.DropIndex(
                name: "ix_locations_dealer_id_code",
                table: "locations");

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "created_at",
                table: "users",
                type: "timestamp with time zone",
                nullable: false,
                defaultValue: new DateTimeOffset(new DateTime(1, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)));

            migrationBuilder.AddColumn<Guid>(
                name: "created_by",
                table: "users",
                type: "uuid",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"));

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "deleted_at",
                table: "users",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "deleted_by",
                table: "users",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "is_deleted",
                table: "users",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "updated_at",
                table: "users",
                type: "timestamp with time zone",
                nullable: false,
                defaultValue: new DateTimeOffset(new DateTime(1, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)));

            migrationBuilder.AddColumn<Guid>(
                name: "updated_by",
                table: "users",
                type: "uuid",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"));

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "created_at",
                table: "user_location_roles",
                type: "timestamp with time zone",
                nullable: false,
                defaultValue: new DateTimeOffset(new DateTime(1, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)));

            migrationBuilder.AddColumn<Guid>(
                name: "created_by",
                table: "user_location_roles",
                type: "uuid",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"));

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "deleted_at",
                table: "user_location_roles",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "deleted_by",
                table: "user_location_roles",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "is_deleted",
                table: "user_location_roles",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "updated_at",
                table: "user_location_roles",
                type: "timestamp with time zone",
                nullable: false,
                defaultValue: new DateTimeOffset(new DateTime(1, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)));

            migrationBuilder.AddColumn<Guid>(
                name: "updated_by",
                table: "user_location_roles",
                type: "uuid",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"));

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "created_at",
                table: "locations",
                type: "timestamp with time zone",
                nullable: false,
                defaultValue: new DateTimeOffset(new DateTime(1, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)));

            migrationBuilder.AddColumn<Guid>(
                name: "created_by",
                table: "locations",
                type: "uuid",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"));

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "deleted_at",
                table: "locations",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "deleted_by",
                table: "locations",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "is_deleted",
                table: "locations",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "updated_at",
                table: "locations",
                type: "timestamp with time zone",
                nullable: false,
                defaultValue: new DateTimeOffset(new DateTime(1, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)));

            migrationBuilder.AddColumn<Guid>(
                name: "updated_by",
                table: "locations",
                type: "uuid",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"));

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "created_at",
                table: "dealers",
                type: "timestamp with time zone",
                nullable: false,
                defaultValue: new DateTimeOffset(new DateTime(1, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)));

            migrationBuilder.AddColumn<Guid>(
                name: "created_by",
                table: "dealers",
                type: "uuid",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"));

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "deleted_at",
                table: "dealers",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "deleted_by",
                table: "dealers",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "is_deleted",
                table: "dealers",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "updated_at",
                table: "dealers",
                type: "timestamp with time zone",
                nullable: false,
                defaultValue: new DateTimeOffset(new DateTime(1, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)));

            migrationBuilder.AddColumn<Guid>(
                name: "updated_by",
                table: "dealers",
                type: "uuid",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"));

            // Existing rows were created by the seeding, before audit columns existed: stamp them now, as the system.
            foreach (var table in new[] { "dealers", "locations", "users", "user_location_roles" })
            {
                migrationBuilder.Sql($"UPDATE {table} SET created_at = now(), updated_at = now()");
            }

            migrationBuilder.CreateIndex(
                name: "ix_users_email",
                table: "users",
                column: "email",
                unique: true,
                filter: "NOT is_deleted");

            migrationBuilder.AddCheckConstraint(
                name: "ck_users_deleted",
                table: "users",
                sql: "is_deleted = (deleted_at IS NOT NULL) AND is_deleted = (deleted_by IS NOT NULL)");

            migrationBuilder.AddCheckConstraint(
                name: "ck_user_location_roles_deleted",
                table: "user_location_roles",
                sql: "is_deleted = (deleted_at IS NOT NULL) AND is_deleted = (deleted_by IS NOT NULL)");

            migrationBuilder.CreateIndex(
                name: "ix_locations_dealer_id_code",
                table: "locations",
                columns: new[] { "dealer_id", "code" },
                unique: true,
                filter: "NOT is_deleted");

            migrationBuilder.AddCheckConstraint(
                name: "ck_locations_deleted",
                table: "locations",
                sql: "is_deleted = (deleted_at IS NOT NULL) AND is_deleted = (deleted_by IS NOT NULL)");

            migrationBuilder.AddCheckConstraint(
                name: "ck_dealers_deleted",
                table: "dealers",
                sql: "is_deleted = (deleted_at IS NOT NULL) AND is_deleted = (deleted_by IS NOT NULL)");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "ix_users_email",
                table: "users");

            migrationBuilder.DropCheckConstraint(
                name: "ck_users_deleted",
                table: "users");

            migrationBuilder.DropCheckConstraint(
                name: "ck_user_location_roles_deleted",
                table: "user_location_roles");

            migrationBuilder.DropIndex(
                name: "ix_locations_dealer_id_code",
                table: "locations");

            migrationBuilder.DropCheckConstraint(
                name: "ck_locations_deleted",
                table: "locations");

            migrationBuilder.DropCheckConstraint(
                name: "ck_dealers_deleted",
                table: "dealers");

            migrationBuilder.DropColumn(
                name: "created_at",
                table: "users");

            migrationBuilder.DropColumn(
                name: "created_by",
                table: "users");

            migrationBuilder.DropColumn(
                name: "deleted_at",
                table: "users");

            migrationBuilder.DropColumn(
                name: "deleted_by",
                table: "users");

            migrationBuilder.DropColumn(
                name: "is_deleted",
                table: "users");

            migrationBuilder.DropColumn(
                name: "updated_at",
                table: "users");

            migrationBuilder.DropColumn(
                name: "updated_by",
                table: "users");

            migrationBuilder.DropColumn(
                name: "created_at",
                table: "user_location_roles");

            migrationBuilder.DropColumn(
                name: "created_by",
                table: "user_location_roles");

            migrationBuilder.DropColumn(
                name: "deleted_at",
                table: "user_location_roles");

            migrationBuilder.DropColumn(
                name: "deleted_by",
                table: "user_location_roles");

            migrationBuilder.DropColumn(
                name: "is_deleted",
                table: "user_location_roles");

            migrationBuilder.DropColumn(
                name: "updated_at",
                table: "user_location_roles");

            migrationBuilder.DropColumn(
                name: "updated_by",
                table: "user_location_roles");

            migrationBuilder.DropColumn(
                name: "created_at",
                table: "locations");

            migrationBuilder.DropColumn(
                name: "created_by",
                table: "locations");

            migrationBuilder.DropColumn(
                name: "deleted_at",
                table: "locations");

            migrationBuilder.DropColumn(
                name: "deleted_by",
                table: "locations");

            migrationBuilder.DropColumn(
                name: "is_deleted",
                table: "locations");

            migrationBuilder.DropColumn(
                name: "updated_at",
                table: "locations");

            migrationBuilder.DropColumn(
                name: "updated_by",
                table: "locations");

            migrationBuilder.DropColumn(
                name: "created_at",
                table: "dealers");

            migrationBuilder.DropColumn(
                name: "created_by",
                table: "dealers");

            migrationBuilder.DropColumn(
                name: "deleted_at",
                table: "dealers");

            migrationBuilder.DropColumn(
                name: "deleted_by",
                table: "dealers");

            migrationBuilder.DropColumn(
                name: "is_deleted",
                table: "dealers");

            migrationBuilder.DropColumn(
                name: "updated_at",
                table: "dealers");

            migrationBuilder.DropColumn(
                name: "updated_by",
                table: "dealers");

            migrationBuilder.CreateIndex(
                name: "ix_users_email",
                table: "users",
                column: "email",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_locations_dealer_id_code",
                table: "locations",
                columns: new[] { "dealer_id", "code" },
                unique: true);
        }
    }
}
