export interface StockListItemDto {
  partId: string;
  partNumber: string;
  description: string;
  binId: string;
  binCode: string;
  quantityOnHand: number;
  reorderLevel: number;
  belowReorderLevel: boolean;
}
