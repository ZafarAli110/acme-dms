/** The part as stocked at the selected location. */
export interface PartInventoryDto {
  binId: string;
  binCode: string;
  quantityOnHand: number;
  reorderLevel: number;
  belowReorderLevel: boolean;
}
