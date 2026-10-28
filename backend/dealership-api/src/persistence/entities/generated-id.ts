import type {PrimaryColumnOptions} from 'typeorm';

/**
 * The primary key of a business table: a UUID v7 the database generates (`uuidv7()`, PostgreSQL 18), so ids sort by
 * creation time and keep the index compact. Code never makes one up; it saves the row and reads the id back.
 */
export const UUID_V7_PRIMARY_KEY: PrimaryColumnOptions = {type: 'uuid', default: () => 'uuidv7()'};

/** A row that is not saved yet: everything but the id, which the database assigns on insert. */
export type NewEntity<TEntity extends {id: string}> = Omit<TEntity, 'id'>;
