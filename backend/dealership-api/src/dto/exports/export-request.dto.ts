import {ApiProperty} from '@nestjs/swagger';
import {Type} from 'class-transformer';
import {ArrayMaxSize, ArrayMinSize, IsString, MaxLength, MinLength, ValidateNested} from 'class-validator';
import {ListQueryDto} from '../paging/list-query.dto';

/** One column of the file: the list's field, under the heading the user sees it with (in their language). */
export class ExportColumnDto {
  @ApiProperty()
  @IsString()
  @MaxLength(50)
  public field!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  public header!: string;
}

/**
 * An export of a list as it is shown: its search, sort and filter (the list's query, every page) and its visible
 * columns, in their order. `page` and `pageSize` are ignored: the file holds every row.
 */
export class ExportRequestDto extends ListQueryDto {
  @ApiProperty({type: [ExportColumnDto]})
  @ValidateNested({each: true})
  @Type(() => ExportColumnDto)
  @ArrayMinSize(1)
  @ArrayMaxSize(30)
  public columns!: ExportColumnDto[];
}
