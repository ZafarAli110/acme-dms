import type {MigrationInterface, QueryRunner} from 'typeorm';

/** Tables that get the full set of audit and soft-delete columns (docs/standards/database.md). */
const AUDITED_TABLES = ['parts', 'part_inventories', 'part_photos', 'bins', 'customers'];

/**
 * Every business table gets created/updated by and at, and a soft delete. Existing rows are backfilled from the
 * columns they already had. Unique rules now ignore deleted rows, so a deleted part number or bin code can be used again.
 */
export class AuditColumns1762000000000 implements MigrationInterface {
  public readonly name = 'AuditColumns1762000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Fill in what each table did not record yet, from what it did.
    await queryRunner.query(`
      ALTER TABLE part_inventories ADD COLUMN created_at timestamptz, ADD COLUMN created_by uuid;
      UPDATE part_inventories SET created_at = updated_at, created_by = updated_by;
      ALTER TABLE part_inventories ALTER COLUMN created_at SET NOT NULL, ALTER COLUMN created_by SET NOT NULL`);
    for (const table of ['part_photos', 'bins']) {
      await queryRunner.query(`
        ALTER TABLE ${table} ADD COLUMN updated_at timestamptz, ADD COLUMN updated_by uuid;
        UPDATE ${table} SET updated_at = created_at, updated_by = created_by;
        ALTER TABLE ${table} ALTER COLUMN updated_at SET NOT NULL, ALTER COLUMN updated_by SET NOT NULL`);
    }

    for (const table of AUDITED_TABLES) {
      await queryRunner.query(`
        ALTER TABLE ${table}
          ADD COLUMN is_deleted boolean NOT NULL DEFAULT false,
          ADD COLUMN deleted_at timestamptz,
          ADD COLUMN deleted_by uuid,
          ADD CONSTRAINT ck_${table}_deleted CHECK (is_deleted = (deleted_at IS NOT NULL) AND is_deleted = (deleted_by IS NOT NULL))`);
    }

    // Unique among the rows that are not deleted.
    await queryRunner.query(`
      ALTER TABLE parts DROP CONSTRAINT uq_parts_dealer_part_number;
      CREATE UNIQUE INDEX uq_parts_dealer_part_number ON parts (dealer_id, part_number) WHERE NOT is_deleted;
      ALTER TABLE bins DROP CONSTRAINT uq_bins_location_code;
      CREATE UNIQUE INDEX uq_bins_location_code ON bins (location_id, code) WHERE NOT is_deleted;
      ALTER TABLE part_inventories DROP CONSTRAINT uq_part_inventories_location_part;
      CREATE UNIQUE INDEX uq_part_inventories_location_part ON part_inventories (location_id, part_id) WHERE NOT is_deleted`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX uq_part_inventories_location_part;
      ALTER TABLE part_inventories ADD CONSTRAINT uq_part_inventories_location_part UNIQUE (location_id, part_id);
      DROP INDEX uq_bins_location_code;
      ALTER TABLE bins ADD CONSTRAINT uq_bins_location_code UNIQUE (location_id, code);
      DROP INDEX uq_parts_dealer_part_number;
      ALTER TABLE parts ADD CONSTRAINT uq_parts_dealer_part_number UNIQUE (dealer_id, part_number)`);
    for (const table of AUDITED_TABLES) {
      await queryRunner.query(`
        ALTER TABLE ${table}
          DROP CONSTRAINT ck_${table}_deleted,
          DROP COLUMN is_deleted,
          DROP COLUMN deleted_at,
          DROP COLUMN deleted_by`);
    }
    for (const table of ['part_photos', 'bins']) {
      await queryRunner.query(`ALTER TABLE ${table} DROP COLUMN updated_at, DROP COLUMN updated_by`);
    }
    await queryRunner.query('ALTER TABLE part_inventories DROP COLUMN created_at, DROP COLUMN created_by');
  }
}
