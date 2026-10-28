import {DataSource} from 'typeorm';
import {Bin} from '../entities/bin.entity';
import {Customer} from '../entities/customer.entity';
import {PartInventory} from '../entities/part-inventory.entity';
import {PartPhoto} from '../entities/part-photo.entity';
import {Part} from '../entities/part.entity';
import {ProcessedMessage} from '../entities/processed-message.entity';
import {InitialSchema1761700000000} from '../migrations/1761700000000-initial-schema';
import {Customers1761800000000} from '../migrations/1761800000000-customers';
import {PartInventoriesAndBins1761900000000} from '../migrations/1761900000000-part-inventories-and-bins';
import {AuditColumns1762000000000} from '../migrations/1762000000000-audit-columns';
import {UuidV7Ids1762100000000} from '../migrations/1762100000000-uuid-v7-ids';
import {SnakeCaseNamingStrategy} from './snake-case-naming.strategy';

/** Aspire injects ConnectionStrings__dealership as `Host=...;Port=...;Username=...;Password=...;Database=...`. */
function parseConnectionString(connectionString: string): Record<string, string> {
  return Object.fromEntries(
    connectionString
      .split(';')
      .map((pair) => pair.split('='))
      .filter((parts): parts is [string, string] => parts.length === 2)
      .map(([key, value]) => [key.trim().toLowerCase(), value.trim()]),
  );
}

/** TypeORM's connection, for the handlers not moved to the unit of work yet. Drizzle owns the schema and migrations. */
export async function createDataSourceAsync(): Promise<DataSource> {
  const connectionString = process.env['ConnectionStrings__dealership'];
  if (!connectionString) {
    throw new Error('ConnectionStrings__dealership is not set; dealership-api must run under Aspire.');
  }
  const settings = parseConnectionString(connectionString);

  const dataSource = new DataSource({
    type: 'postgres',
    host: settings['host'],
    port: Number(settings['port'] ?? 5432),
    username: settings['username'],
    password: settings['password'],
    database: settings['database'],
    entities: [Part, Bin, PartInventory, PartPhoto, Customer, ProcessedMessage],
    migrations: [
      InitialSchema1761700000000,
      Customers1761800000000,
      PartInventoriesAndBins1761900000000,
      AuditColumns1762000000000,
      UuidV7Ids1762100000000,
    ],
    namingStrategy: new SnakeCaseNamingStrategy(),
    synchronize: false,
  });
  await dataSource.initialize();
  return dataSource;
}
