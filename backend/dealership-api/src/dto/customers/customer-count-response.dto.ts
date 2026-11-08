/** How many customers a search and filter match: exact up to 10,000, 10,001 past it (shown as "10,000+"). */
export interface CustomerCountResponseDto {
  total: number;
}
