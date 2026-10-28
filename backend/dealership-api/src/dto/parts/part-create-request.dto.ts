import {ApiProperty} from '@nestjs/swagger';
import {IsInt, IsNotEmpty, IsNumber, IsString, IsUUID, Matches, MaxLength, Min} from 'class-validator';

/**
 * A new part is always created at the selected location, into one of that location's bins (`GET /v1/bins`): a part
 * that is not stocked anywhere cannot be found.
 */
export class PartCreateRequestDto {
  @ApiProperty({example: 'BRK-PAD-001'})
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  @Matches(/^[A-Z0-9-]+$/, {message: 'partNumber may only contain capital letters, digits and dashes'})
  public partNumber: string;

  @ApiProperty({example: 'Front brake pads, ceramic'})
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  public description: string;

  @ApiProperty({example: 49.99})
  @IsNumber({maxDecimalPlaces: 2})
  @Min(0)
  public unitPrice: number;

  @ApiProperty({description: 'A bin of the selected location (GET /v1/bins)', format: 'uuid'})
  @IsUUID()
  public binId: string;

  @ApiProperty({example: 6})
  @IsInt()
  @Min(0)
  public quantityOnHand: number;

  @ApiProperty({example: 4})
  @IsInt()
  @Min(0)
  public reorderLevel: number;
}
