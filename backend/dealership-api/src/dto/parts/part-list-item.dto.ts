import type {PartInventoryDto} from './part-inventory.dto';

export interface PartListItemDto {
  id: string;
  partNumber: string;
  description: string;
  unitPrice: number;
  /** The document id of the part's default ready photo; fetch its "thumb" variant from document-api. */
  thumbnailDocumentId: string | null;
  inventory: PartInventoryDto;
}
