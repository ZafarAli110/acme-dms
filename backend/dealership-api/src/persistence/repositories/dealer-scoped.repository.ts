import type {Repository, SelectQueryBuilder} from 'typeorm';
import type {AuditedEntity} from '../entities/audited-entity';

/**
 * Base for repositories of dealer-owned data. Every read starts from `forDealer`, so no query can forget the
 * tenant or show a deleted row, and `assertSameDealer` stops a write from storing a row under another dealer.
 */
export abstract class DealerScopedRepository<TEntity extends AuditedEntity & {dealerId: string}> {
  protected readonly _repository: Repository<TEntity>;
  private readonly _alias: string;

  protected constructor(repository: Repository<TEntity>, alias: string) {
    this._repository = repository;
    this._alias = alias;
  }

  protected forDealer(dealerId: string): SelectQueryBuilder<TEntity> {
    return this._repository
      .createQueryBuilder(this._alias)
      .where(`${this._alias}.dealerId = :dealerId`, {dealerId})
      .andWhere(`${this._alias}.isDeleted = false`);
  }

  protected assertSameDealer(dealerId: string, entity: {dealerId: string}): void {
    if (entity.dealerId !== dealerId) {
      throw new Error(`Refusing to write a row of dealer ${entity.dealerId} on behalf of dealer ${dealerId}.`);
    }
  }
}
