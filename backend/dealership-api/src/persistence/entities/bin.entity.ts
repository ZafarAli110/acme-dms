import {Column, Entity, PrimaryColumn} from 'typeorm';
import {AuditedEntity} from './audited-entity';

/** A storage place inside one location's parts store (shelf, rack, drawer). Location-scoped. */
@Entity('bins')
export class Bin extends AuditedEntity {
  @PrimaryColumn('uuid')
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
