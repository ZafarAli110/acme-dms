import { i18nValidationMessage } from "@nestjs/i18n";
import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsString, Matches, MaxLength } from "class-validator";

/** A new bin of the selected location. */
export class BinCreateRequestDto {
  @ApiProperty({ example: "A-12" })
  @IsString()
  @MaxLength(20)
  @Matches(/^[A-Z0-9-]+$/, { message: i18nValidationMessage("validation.codeFormat") })
  public code: string;

  @ApiProperty({ example: "Brakes, aisle A" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  public description: string;
}
