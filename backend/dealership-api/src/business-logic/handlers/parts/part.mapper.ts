import type {PartInventoryDto} from '#dto/parts/part-inventory.dto';
import type {PartPhotoResponseDto} from '#dto/parts/part-photo-response.dto';
import type {PartResponseDto} from '#dto/parts/part-response.dto';
import type {Bin, Part, PartInventory, PartPhoto} from '#persistence/schema/index';
import {toIsoString} from '#business-logic-abstractions/time/to-iso-string';

export function toPartInventoryDto(inventory: PartInventory, bin: Bin): PartInventoryDto {
  return {
    binId: bin.id,
    binCode: bin.code,
    quantityOnHand: inventory.quantityOnHand,
    reorderLevel: inventory.reorderLevel,
    belowReorderLevel: inventory.quantityOnHand < inventory.reorderLevel,
  };
}

export function toPartPhotoResponseDto(photo: PartPhoto): PartPhotoResponseDto {
  return {
    id: photo.id,
    documentId: photo.documentId,
    originalFileName: photo.originalFileName,
    status: photo.status,
    failureReason: photo.failureReason,
    isDefault: photo.isDefault,
    createdAt: toIsoString(photo.createdAt),
  };
}

export function toPartResponseDto(
  part: Part,
  inventory: PartInventory,
  bin: Bin,
  photos: PartPhoto[],
): PartResponseDto {
  return {
    id: part.id,
    partNumber: part.partNumber,
    description: part.description,
    unitPrice: part.unitPrice,
    inventory: toPartInventoryDto(inventory, bin),
    photos: photos.map(toPartPhotoResponseDto),
    createdAt: toIsoString(part.createdAt),
    updatedAt: toIsoString(part.updatedAt),
  };
}
