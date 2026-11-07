using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Acme.Identity.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class RefreshReplayAndSigningKeyRotation : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterColumn<byte[]>(
                name: "private_key_pkcs8",
                table: "signing_keys",
                type: "bytea",
                nullable: true,
                oldClrType: typeof(byte[]),
                oldType: "bytea");

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "activates_at",
                table: "signing_keys",
                type: "timestamp with time zone",
                nullable: false,
                defaultValue: new DateTimeOffset(new DateTime(1, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)));

            migrationBuilder.AddColumn<byte[]>(
                name: "protected_private_key",
                table: "signing_keys",
                type: "bytea",
                nullable: true);

            // A key that already exists has been signing since it was made. Its private key is encrypted the first time
            // identity-api loads it (SigningKeyProvider), which a migration cannot do: Data Protection's keys are not here.
            migrationBuilder.Sql("UPDATE signing_keys SET activates_at = created_at;");

            migrationBuilder.AddColumn<byte[]>(
                name: "next_token_sealed",
                table: "refresh_tokens",
                type: "bytea",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "activates_at",
                table: "signing_keys");

            migrationBuilder.DropColumn(
                name: "protected_private_key",
                table: "signing_keys");

            migrationBuilder.DropColumn(
                name: "next_token_sealed",
                table: "refresh_tokens");

            migrationBuilder.AlterColumn<byte[]>(
                name: "private_key_pkcs8",
                table: "signing_keys",
                type: "bytea",
                nullable: false,
                defaultValue: new byte[0],
                oldClrType: typeof(byte[]),
                oldType: "bytea",
                oldNullable: true);
        }
    }
}
