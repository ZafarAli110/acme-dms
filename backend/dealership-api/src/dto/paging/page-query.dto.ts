import {ApiPropertyOptional} from '@nestjs/swagger';
import {Type} from 'class-transformer';
import {IsInt, IsOptional, IsString, Max, MaxLength, Min} from 'class-validator';

/** Query string for list endpoints: `?search=brake&page=1&pageSize=25`. */
export class PageQueryDto {
  @ApiPropertyOptional({description: 'Free text; each list says which fields it matches'})
  @IsOptional()
  @IsString()
  @MaxLength(100)
  public search?: string;

  @ApiPropertyOptional({default: 1})
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  public page?: number;

  @ApiPropertyOptional({default: 25, maximum: 100})
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  public pageSize?: number;
}
