import {Column} from 'typeorm';
import {INSTANT_COLUMN} from '../transformers/temporal.transformers';

/**
 * The columns every business table has (docs/standards/database.md): who created and last changed the row and when,
 * and a soft delete. Rows are never deleted; a deleted row has `isDeleted` set and is left out of every read.
 */
export abstract class AuditedEntity {
  @Column('timestamptz', {transformer: INSTANT_COLUMN})
  public createdAt: Temporal.Instant;

  @Column('uuid')
  public createdBy: string;

  @Column('timestamptz', {transformer: INSTANT_COLUMN})
  public updatedAt: Temporal.Instant;

  @Column('uuid')
  public updatedBy: string;

  @Column('boolean', {default: false})
  public isDeleted: boolean;

  @Column('timestamptz', {nullable: true, transformer: INSTANT_COLUMN})
  public deletedAt: Temporal.Instant | null;

  @Column('uuid', {nullable: true})
  public deletedBy: string | null;
}
