import {Column, Entity, PrimaryColumn} from 'typeorm';
import {AuditedEntity} from './audited-entity';
import {UUID_V7_PRIMARY_KEY} from './generated-id';
import {PLAIN_DATE_COLUMN} from '../transformers/temporal.transformers';

export type CustomerStatus = 'active' | 'prospect' | 'inactive';

/** A customer of one location (rooftop). Location-scoped: always query it for a single location. */
@Entity('customers')
export class Customer extends AuditedEntity {
  @PrimaryColumn(UUID_V7_PRIMARY_KEY)
  public id: string;

  @Column('uuid')
  public dealerId: string;

  @Column('uuid')
  public locationId: string;

  @Column('varchar', {length: 100})
  public firstName: string;

  @Column('varchar', {length: 100})
  public surname: string;

  @Column('varchar', {length: 200, nullable: true})
  public companyName: string | null;

  @Column('varchar', {length: 254, nullable: true})
  public email: string | null;

  @Column('varchar', {length: 40, nullable: true})
  public phone: string | null;

  @Column('varchar', {length: 100, nullable: true})
  public city: string | null;

  @Column('varchar', {length: 20})
  public status: CustomerStatus;

  @Column('date', {nullable: true, transformer: PLAIN_DATE_COLUMN})
  public lastContactDate: Temporal.PlainDate | null;
}
