using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Acme.Identity.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class UuidV7Defaults : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterColumn<Guid>(
                name: "id",
                table: "users",
                type: "uuid",
                nullable: false,
                defaultValueSql: "uuidv7()",
                oldClrType: typeof(Guid),
                oldType: "uuid");

            migrationBuilder.AlterColumn<Guid>(
                name: "id",
                table: "locations",
                type: "uuid",
                nullable: false,
                defaultValueSql: "uuidv7()",
                oldClrType: typeof(Guid),
                oldType: "uuid");

            migrationBuilder.AlterColumn<Guid>(
                name: "id",
                table: "dealers",
                type: "uuid",
                nullable: false,
                defaultValueSql: "uuidv7()",
                oldClrType: typeof(Guid),
                oldType: "uuid");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterColumn<Guid>(
                name: "id",
                table: "users",
                type: "uuid",
                nullable: false,
                oldClrType: typeof(Guid),
                oldType: "uuid",
                oldDefaultValueSql: "uuidv7()");

            migrationBuilder.AlterColumn<Guid>(
                name: "id",
                table: "locations",
                type: "uuid",
                nullable: false,
                oldClrType: typeof(Guid),
                oldType: "uuid",
                oldDefaultValueSql: "uuidv7()");

            migrationBuilder.AlterColumn<Guid>(
                name: "id",
                table: "dealers",
                type: "uuid",
                nullable: false,
                oldClrType: typeof(Guid),
                oldType: "uuid",
                oldDefaultValueSql: "uuidv7()");
        }
    }
}
