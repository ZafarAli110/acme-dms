import type {DataSource} from 'typeorm';
import {PartPhoto, type PartPhotoStatus} from '../entities/part-photo.entity';
import {DealerScopedRepository} from './dealer-scoped.repository';
import type {IPartPhotoRepository} from './part-photo.repository.interface';

export class PartPhotoRepository extends DealerScopedRepository<PartPhoto> implements IPartPhotoRepository {
  private readonly _dataSource: DataSource;

  public constructor(dataSource: DataSource) {
    super(dataSource.getRepository(PartPhoto), 'photo');
    this._dataSource = dataSource;
  }

  public findForPartAsync(dealerId: string, partId: string): Promise<PartPhoto[]> {
    return this.forDealer(dealerId)
      .andWhere('photo.partId = :partId', {partId})
      .orderBy('photo.createdAt', 'ASC')
      .getMany();
  }

  public async findThumbnailsAsync(dealerId: string, partIds: string[]): Promise<Map<string, PartPhoto>> {
    if (partIds.length === 0) {
      return new Map();
    }
    const photos = await this.forDealer(dealerId)
      .andWhere('photo.partId IN (:...partIds)', {partIds})
      .andWhere("photo.status = 'ready'")
      .orderBy('photo.isDefault', 'DESC')
      .addOrderBy('photo.createdAt', 'ASC')
      .getMany();
    const thumbnails = new Map<string, PartPhoto>();
    for (const photo of photos) {
      if (!thumbnails.has(photo.partId)) {
        thumbnails.set(photo.partId, photo);
      }
    }
    return thumbnails;
  }

  public saveAsync(dealerId: string, photo: PartPhoto): Promise<PartPhoto> {
    this.assertSameDealer(dealerId, photo);
    return this._repository.save(photo);
  }

  public updateStatusOnceAsync(
    messageId: string,
    dealerId: string,
    documentId: string,
    status: PartPhotoStatus,
    failureReason: string | null,
    updated: {at: Temporal.Instant; by: string},
  ): Promise<boolean> {
    return this._dataSource.transaction(async (manager) => {
      // The inbox row and the photo update commit together; a redelivered message hits the conflict and stops here.
      const inserted: unknown[] = await manager.query(
        'INSERT INTO processed_messages (message_id, processed_at) VALUES ($1, now()) ON CONFLICT DO NOTHING RETURNING message_id',
        [messageId],
      );
      if (inserted.length === 0) {
        return false;
      }
      await manager
        .createQueryBuilder()
        .update(PartPhoto)
        .set({status, failureReason, updatedAt: updated.at, updatedBy: updated.by})
        .where('dealerId = :dealerId AND documentId = :documentId', {dealerId, documentId})
        .execute();
      return true;
    });
  }
}
