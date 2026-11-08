import type { PartInventoryDto } from "./part-inventory.dto";
import type { PartPhotoResponseDto } from "./part-photo-response.dto";

export interface PartResponseDto {
  id: string;
  partNumber: string;
  description: string;
  /** In pence: 4999 is £49.99. */
  unitPriceCents: number;
  /** The part at the selected location: bin and quantity. */
  inventory: PartInventoryDto;
  photos: PartPhotoResponseDto[];
  createdAt: string;
  updatedAt: string;
  /** Goes up with every change; also the response's ETag. Send it back as If-Match to save. */
  version: number;
}
