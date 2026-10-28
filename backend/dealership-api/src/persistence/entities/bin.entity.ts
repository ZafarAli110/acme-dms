import {Column, Entity, PrimaryColumn} from 'typeorm';
import {AuditedEntity} from './audited-entity';
import {UUID_V7_PRIMARY_KEY} from './generated-id';

/** A storage place inside one location's parts store (shelf, rack, drawer). Location-scoped. */
@Entity('bins')
export class Bin extends AuditedEntity {
  @PrimaryColumn(UUID_V7_PRIMARY_KEY)
  public id: string;

  @Column('uuid')
  public dealerId: string;

  @Column('uuid')
  public locationId: string;

  @Column('varchar', {length: 20})
  public code: string;

  @Column('varchar', {length: 100})
  public description: string;
}
