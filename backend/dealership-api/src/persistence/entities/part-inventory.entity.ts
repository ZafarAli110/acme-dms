import {Column, Entity, PrimaryColumn} from 'typeorm';
import {AuditedEntity} from './audited-entity';

/**
 * A part's inventory at one location: which bin it lives in and how many are on hand. A part is only stocked (and
 * only visible) at locations where it has one of these. Location-scoped: always query it for a single location.
 */
@Entity('part_inventories')
export class PartInventory extends AuditedEntity {
  @PrimaryColumn('uuid')
  public id: string;

  @Column('uuid')
  public dealerId: string;

  @Column('uuid')
  public locationId: string;

  @Column('uuid')
  public partId: string;

  @Column('uuid')
  public binId: string;

  @Column('integer')
  public quantityOnHand: number;

  @Column('integer')
  public reorderLevel: number;
}
