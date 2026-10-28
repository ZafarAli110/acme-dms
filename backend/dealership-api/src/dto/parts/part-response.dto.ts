import type {PartInventoryDto} from './part-inventory.dto';
import type {PartPhotoResponseDto} from './part-photo-response.dto';

export interface PartResponseDto {
  id: string;
  partNumber: string;
  description: string;
  unitPrice: number;
  /** The part at the selected location: bin and quantity. */
  inventory: PartInventoryDto;
  photos: PartPhotoResponseDto[];
  createdAt: string;
  updatedAt: string;
}
