import type {DataSource} from 'typeorm';
import {Bin} from '../entities/bin.entity';
import type {NewEntity} from '../entities/generated-id';
import type {IBinRepository} from './bin.repository.interface';
import {DealerScopedRepository} from './dealer-scoped.repository';

export class BinRepository extends DealerScopedRepository<Bin> implements IBinRepository {
  public constructor(dataSource: DataSource) {
    super(dataSource.getRepository(Bin), 'bin');
  }

  public findForLocationAsync(dealerId: string, locationId: string): Promise<Bin[]> {
    return this.forDealer(dealerId)
      .andWhere('bin.locationId = :locationId', {locationId})
      .orderBy('bin.code', 'ASC')
      .getMany();
  }

  public findByIdAsync(dealerId: string, locationId: string, binId: string): Promise<Bin | null> {
    return this.forDealer(dealerId)
      .andWhere('bin.locationId = :locationId', {locationId})
      .andWhere('bin.id = :binId', {binId})
      .getOne();
  }

  public async existsWithCodeAsync(dealerId: string, locationId: string, code: string): Promise<boolean> {
    const count = await this.forDealer(dealerId)
      .andWhere('bin.locationId = :locationId', {locationId})
      .andWhere('bin.code = :code', {code})
      .getCount();
    return count > 0;
  }

  public saveAsync(dealerId: string, bin: Bin | NewEntity<Bin>): Promise<Bin> {
    this.assertSameDealer(dealerId, bin);
    return this._repository.save(bin);
  }
}
