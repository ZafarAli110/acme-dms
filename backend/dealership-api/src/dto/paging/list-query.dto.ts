import {ApiPropertyOptional} from '@nestjs/swagger';
import {IsIn, IsOptional, IsString, MaxLength} from 'class-validator';
import {PageQueryDto} from './page-query.dto';

export const SORT_DIRECTIONS = ['asc', 'desc'] as const;
export type SortDirection = (typeof SORT_DIRECTIONS)[number];

/**
 * The operators a list column can be filtered with, by the column's type. The names are the data grid's, so the web
 * app sends its filter as it is.
 */
export const FILTER_OPERATORS = {
  text: ['contains', 'equals', 'startsWith', 'endsWith', 'isEmpty', 'isNotEmpty'],
  number: ['=', '!=', '>', '>=', '<', '<=', 'isEmpty', 'isNotEmpty'],
  date: ['is', 'not', 'after', 'onOrAfter', 'before', 'onOrBefore', 'isEmpty', 'isNotEmpty'],
  /** One of a fixed set of values (a status): the grid shows them in a dropdown. */
  choice: ['is', 'not'],
} as const;
export type FilterOperator = (typeof FILTER_OPERATORS)[keyof typeof FILTER_OPERATORS][number];
const ALL_OPERATORS: readonly string[] = [...new Set(Object.values(FILTER_OPERATORS).flat())];

/**
 * A list page's query: the page, a free-text search, one sort and one filter, as the data grid offers them.
 * `?search=&page=&pageSize=&sort=city&direction=desc&filterField=status&filterOperator=equals&filterValue=active`.
 * Which fields can be sorted and filtered is each list's own; another field is a 400.
 */
export class ListQueryDto extends PageQueryDto {
  @ApiPropertyOptional({description: 'A field of the list; the list says which'})
  @IsOptional()
  @IsString()
  @MaxLength(50)
  public sort?: string;

  @ApiPropertyOptional({enum: SORT_DIRECTIONS, default: 'asc'})
  @IsOptional()
  @IsIn(SORT_DIRECTIONS)
  public direction?: SortDirection;

  @ApiPropertyOptional({description: 'A field of the list; the list says which'})
  @IsOptional()
  @IsString()
  @MaxLength(50)
  public filterField?: string;

  @ApiPropertyOptional({enum: ALL_OPERATORS})
  @IsOptional()
  @IsIn(ALL_OPERATORS)
  public filterOperator?: FilterOperator;

  @ApiPropertyOptional({description: 'Not needed for isEmpty and isNotEmpty; a date is YYYY-MM-DD'})
  @IsOptional()
  @IsString()
  @MaxLength(200)
  public filterValue?: string;
}
