import type { PartInventoryDto } from "./part-inventory.dto";

export interface PartListItemDto {
  id: string;
  partNumber: string;
  description: string;
  /** In pence: 4999 is £49.99. */
  unitPriceCents: number;
  /** The document id of the part's default ready photo; fetch its "thumb" variant from document-api. */
  thumbnailDocumentId: string | null;
  inventory: PartInventoryDto;
  /** What this location's stock of the part is worth: on hand × price, in pence. */
  stockValueCents: number;
}
