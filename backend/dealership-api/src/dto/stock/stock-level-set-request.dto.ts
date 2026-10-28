import {ApiProperty} from '@nestjs/swagger';
import {IsInt, IsUUID, Min} from 'class-validator';

/** Sets the part's inventory at the selected location; stocks the part there if the location did not have it yet. */
export class StockLevelSetRequestDto {
  @ApiProperty({description: 'A bin of the selected location (GET /v1/bins)', format: 'uuid'})
  @IsUUID()
  public binId: string;

  @ApiProperty({example: 12})
  @IsInt()
  @Min(0)
  public quantityOnHand: number;

  @ApiProperty({example: 4})
  @IsInt()
  @Min(0)
  public reorderLevel: number;
}
