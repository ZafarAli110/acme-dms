import {Module} from '@nestjs/common';
import type {DataSource} from 'typeorm';
import {createDataSourceAsync} from './data-source/data-source.factory';
import {BIN_REPOSITORY} from './repositories/bin.repository.interface';
import {BinRepository} from './repositories/bin.repository';
import {CUSTOMER_REPOSITORY} from './repositories/customer.repository.interface';
import {CustomerRepository} from './repositories/customer.repository';
import {PART_INVENTORY_REPOSITORY} from './repositories/part-inventory.repository.interface';
import {PartInventoryRepository} from './repositories/part-inventory.repository';
import {PART_PHOTO_REPOSITORY} from './repositories/part-photo.repository.interface';
import {PartPhotoRepository} from './repositories/part-photo.repository';
import {PART_REPOSITORY} from './repositories/part.repository.interface';
import {PartRepository} from './repositories/part.repository';

export const DATA_SOURCE = Symbol('DataSource');

/** Registers every repository against its abstraction token. Add one line per new repository. */
const REPOSITORIES = [
  {
    provide: PART_REPOSITORY,
    useFactory: (dataSource: DataSource) => new PartRepository(dataSource),
    inject: [DATA_SOURCE],
  },
  {
    provide: PART_INVENTORY_REPOSITORY,
    useFactory: (dataSource: DataSource) => new PartInventoryRepository(dataSource),
    inject: [DATA_SOURCE],
  },
  {
    provide: BIN_REPOSITORY,
    useFactory: (dataSource: DataSource) => new BinRepository(dataSource),
    inject: [DATA_SOURCE],
  },
  {
    provide: PART_PHOTO_REPOSITORY,
    useFactory: (dataSource: DataSource) => new PartPhotoRepository(dataSource),
    inject: [DATA_SOURCE],
  },
  {
    provide: CUSTOMER_REPOSITORY,
    useFactory: (dataSource: DataSource) => new CustomerRepository(dataSource),
    inject: [DATA_SOURCE],
  },
];

@Module({
  providers: [{provide: DATA_SOURCE, useFactory: createDataSourceAsync}, ...REPOSITORIES],
  exports: [DATA_SOURCE, ...REPOSITORIES.map((repository) => repository.provide)],
})
export class PersistenceModule {}
