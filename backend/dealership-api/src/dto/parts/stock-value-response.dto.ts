/** What the stock at the selected location is worth. */
export interface StockValueResponseDto {
  /** The sum of every stocked part's on hand × price, in cents: 4999 is $49.99. */
  stockValueCents: number;
}
