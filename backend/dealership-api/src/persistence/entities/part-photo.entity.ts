import {Column, Entity, PrimaryColumn} from 'typeorm';
import {AuditedEntity} from './audited-entity';
import {UUID_V7_PRIMARY_KEY} from './generated-id';

export type PartPhotoStatus = 'pending' | 'ready' | 'failed';

/** A photo of a part. The image itself lives in document-api; this row holds the reference and its status. */
@Entity('part_photos')
export class PartPhoto extends AuditedEntity {
  @PrimaryColumn(UUID_V7_PRIMARY_KEY)
  public id: string;

  @Column('uuid')
  public dealerId: string;

  @Column('uuid')
  public partId: string;

  @Column('uuid')
  public documentId: string;

  @Column('varchar', {length: 255})
  public originalFileName: string;

  @Column('varchar', {length: 20})
  public status: PartPhotoStatus;

  @Column('varchar', {length: 1000, nullable: true})
  public failureReason: string | null;

  @Column('boolean')
  public isDefault: boolean;
}
