import type {NewEntity} from '../entities/generated-id';
import type {PartPhoto, PartPhotoStatus} from '../entities/part-photo.entity';

export interface IPartPhotoRepository {
  findForPartAsync(dealerId: string, partId: string): Promise<PartPhoto[]>;
  /** The default (or first) ready photo of each part, keyed by part id. */
  findThumbnailsAsync(dealerId: string, partIds: string[]): Promise<Map<string, PartPhoto>>;
  /** Inserts a new row (the database assigns its id) or updates an existing one; returns the row as saved. */
  saveAsync(dealerId: string, photo: PartPhoto | NewEntity<PartPhoto>): Promise<PartPhoto>;
  /**
   * Records the outcome of document processing, once per message: returns false (and changes nothing) when the
   * message was already handled.
   */
  updateStatusOnceAsync(
    messageId: string,
    dealerId: string,
    documentId: string,
    status: PartPhotoStatus,
    failureReason: string | null,
    updated: {at: Temporal.Instant; by: string},
  ): Promise<boolean>;
}

export const PART_PHOTO_REPOSITORY = Symbol('IPartPhotoRepository');
