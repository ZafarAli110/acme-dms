import {Column, Entity, PrimaryColumn} from 'typeorm';
import {AuditedEntity} from './audited-entity';
import {UUID_V7_PRIMARY_KEY} from './generated-id';
import {decimalTransformer} from './decimal.transformer';

/** A part in a dealer's catalogue. The master record is shared; each location stocks it through a PartInventory. */
@Entity('parts')
export class Part extends AuditedEntity {
  @PrimaryColumn(UUID_V7_PRIMARY_KEY)
  public id: string;

  @Column('uuid')
  public dealerId: string;

  @Column('varchar', {length: 50})
  public partNumber: string;

  @Column('varchar', {length: 500})
  public description: string;

  @Column('numeric', {precision: 12, scale: 2, transformer: decimalTransformer})
  public unitPrice: number;
}
