import type {DataSource} from 'typeorm';
import {Bin} from '../entities/bin.entity';
import {PartInventory} from '../entities/part-inventory.entity';
import {Part} from '../entities/part.entity';
import {DealerScopedRepository} from './dealer-scoped.repository';
import type {IPartInventoryRepository, StockedPart, StockedPartPage} from './part-inventory.repository.interface';

type JoinedInventory = PartInventory & {part: Part; bin: Bin};

export class PartInventoryRepository extends DealerScopedRepository<PartInventory> implements IPartInventoryRepository {
  public constructor(dataSource: DataSource) {
    super(dataSource.getRepository(PartInventory), 'inventory');
  }

  public async findPageForLocationAsync(
    dealerId: string,
    locationId: string,
    search: string | null,
    page: number,
    pageSize: number,
  ): Promise<StockedPartPage> {
    const query = this.withPartAndBin(dealerId, locationId).orderBy('part.partNumber', 'ASC');
    if (search) {
      query.andWhere('(part.partNumber ILIKE :search OR part.description ILIKE :search)', {search: `%${search}%`});
    }
    const [rows, total] = await query
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getManyAndCount();
    return {items: rows.map((row) => toStockedPart(row as JoinedInventory)), total};
  }

  public async findForPartAsync(
    dealerId: string,
    locationId: string,
    partId: string,
  ): Promise<{inventory: PartInventory; bin: Bin} | null> {
    const row = await this.withPartAndBin(dealerId, locationId)
      .andWhere('inventory.partId = :partId', {partId})
      .getOne();
    return row ? toStockedPart(row as JoinedInventory) : null;
  }

  public saveAsync(dealerId: string, inventory: PartInventory): Promise<PartInventory> {
    this.assertSameDealer(dealerId, inventory);
    return this._repository.save(inventory);
  }

  private withPartAndBin(dealerId: string, locationId: string) {
    return this.forDealer(dealerId)
      .andWhere('inventory.locationId = :locationId', {locationId})
      .innerJoinAndMapOne('inventory.part', Part, 'part', 'part.id = inventory.partId AND part.isDeleted = false')
      .innerJoinAndMapOne('inventory.bin', Bin, 'bin', 'bin.id = inventory.binId AND bin.isDeleted = false');
  }
}

function toStockedPart({part, bin, ...inventory}: JoinedInventory): StockedPart {
  return {part, bin, inventory};
}
