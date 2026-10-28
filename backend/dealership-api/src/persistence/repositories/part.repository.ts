import type {DataSource} from 'typeorm';
import type {NewEntity} from '../entities/generated-id';
import {PartInventory} from '../entities/part-inventory.entity';
import {PartPhoto} from '../entities/part-photo.entity';
import {Part} from '../entities/part.entity';
import {DealerScopedRepository} from './dealer-scoped.repository';
import type {IPartRepository, PartPhotoChanges} from './part.repository.interface';

export class PartRepository extends DealerScopedRepository<Part> implements IPartRepository {
  private readonly _dataSource: DataSource;

  public constructor(dataSource: DataSource) {
    super(dataSource.getRepository(Part), 'part');
    this._dataSource = dataSource;
  }

  public findByIdAsync(dealerId: string, partId: string): Promise<Part | null> {
    return this.forDealer(dealerId).andWhere('part.id = :partId', {partId}).getOne();
  }

  public async existsWithPartNumberAsync(dealerId: string, partNumber: string): Promise<boolean> {
    return (await this.forDealer(dealerId).andWhere('part.partNumber = :partNumber', {partNumber}).getCount()) > 0;
  }

  public async createWithInventoryAsync(
    dealerId: string,
    part: NewEntity<Part>,
    inventory: Omit<NewEntity<PartInventory>, 'partId'>,
  ): Promise<{part: Part; inventory: PartInventory}> {
    this.assertSameDealer(dealerId, part);
    if (inventory.dealerId !== dealerId) {
      throw new Error(`Refusing to write inventory of dealer ${inventory.dealerId} on behalf of dealer ${dealerId}.`);
    }
    return this._dataSource.transaction(async (manager) => {
      const savedPart = await manager.save(Part, part);
      const savedInventory = await manager.save(PartInventory, {...inventory, partId: savedPart.id});
      return {part: savedPart, inventory: savedInventory};
    });
  }

  public saveAsync(dealerId: string, part: Part): Promise<Part> {
    this.assertSameDealer(dealerId, part);
    return this._repository.save(part);
  }

  public async saveWithPhotosAsync(dealerId: string, part: Part, photos: PartPhotoChanges): Promise<void> {
    this.assertSameDealer(dealerId, part);
    if (photos.addedPhotos.some((photo) => photo.dealerId !== dealerId || photo.partId !== part.id)) {
      throw new Error(`Refusing to add a photo that does not belong to part ${part.id} of dealer ${dealerId}.`);
    }
    await this._dataSource.transaction(async (manager) => {
      await manager.save(Part, part);
      if (photos.removedPhotoIds.length > 0) {
        // Soft delete: the row stays, marked deleted, so who removed which photo and when is never lost.
        await manager
          .createQueryBuilder()
          .update(PartPhoto)
          .set({
            isDeleted: true,
            deletedAt: photos.at,
            deletedBy: photos.deletedBy,
            updatedAt: photos.at,
            updatedBy: photos.deletedBy,
          })
          .where('dealerId = :dealerId AND partId = :partId AND id IN (:...ids)', {
            dealerId,
            partId: part.id,
            ids: photos.removedPhotoIds,
          })
          .execute();
      }
      for (const kept of photos.kept) {
        // Only a photo whose default flag actually changes is touched (and gets a new updated_at).
        await manager.update(
          PartPhoto,
          {id: kept.id, dealerId, partId: part.id, isDefault: !kept.isDefault},
          {isDefault: kept.isDefault, updatedAt: photos.at, updatedBy: photos.deletedBy},
        );
      }
      if (photos.addedPhotos.length > 0) {
        await manager.save(PartPhoto, photos.addedPhotos);
      }
    });
  }
}
