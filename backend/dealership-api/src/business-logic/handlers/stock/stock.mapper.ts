import type { StockListItemDto } from "#dto/stock/stock-list-item.dto";
import type { Bin } from "#persistence/schema/bins";
import type { PartInventory } from "#persistence/schema/part-inventories";
import type { Part } from "#persistence/schema/parts";

export function toStockListItemDto(
  part: Pick<Part, "id" | "partNumber" | "description">,
  inventory: Pick<PartInventory, "quantityOnHand" | "reorderLevel">,
  bin: Pick<Bin, "id" | "code">,
): StockListItemDto {
  return {
    partId: part.id,
    partNumber: part.partNumber,
    description: part.description,
    binId: bin.id,
    binCode: bin.code,
    quantityOnHand: inventory.quantityOnHand,
    reorderLevel: inventory.reorderLevel,
    belowReorderLevel: inventory.quantityOnHand < inventory.reorderLevel,
  };
}
