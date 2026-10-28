import type {StockListItemDto} from '#dto/stock/stock-list-item.dto';
import type {Bin, Part, PartInventory} from '#persistence/schema/index';

export function toStockListItemDto(part: Part, inventory: PartInventory, bin: Bin): StockListItemDto {
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
