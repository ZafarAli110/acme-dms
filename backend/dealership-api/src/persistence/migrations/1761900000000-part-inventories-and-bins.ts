import type {MigrationInterface, QueryRunner} from 'typeorm';

/**
 * Stock becomes a part's inventory at a location, kept in a bin of that location. Stock rows from before bins existed
 * have no bin, so they are removed; `bun run seed` (or `bun run reset`) recreates them.
 */
export class PartInventoriesAndBins1761900000000 implements MigrationInterface {
  public readonly name = 'PartInventoriesAndBins1761900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE bins (
        id uuid PRIMARY KEY,
        dealer_id uuid NOT NULL,
        location_id uuid NOT NULL,
        code varchar(20) NOT NULL,
        description varchar(100) NOT NULL,
        created_at timestamptz NOT NULL,
        created_by uuid NOT NULL,
        CONSTRAINT uq_bins_location_code UNIQUE (location_id, code)
      )`);
    await queryRunner.query('CREATE INDEX ix_bins_dealer_location ON bins (dealer_id, location_id)');

    await queryRunner.query('DELETE FROM stock_levels');
    await queryRunner.query('ALTER TABLE stock_levels RENAME TO part_inventories');
    await queryRunner.query(
      'ALTER TABLE part_inventories RENAME CONSTRAINT stock_levels_pkey TO part_inventories_pkey',
    );
    await queryRunner.query(
      'ALTER TABLE part_inventories RENAME CONSTRAINT stock_levels_part_id_fkey TO part_inventories_part_id_fkey',
    );
    await queryRunner.query(
      'ALTER TABLE part_inventories RENAME CONSTRAINT uq_stock_levels_location_part TO uq_part_inventories_location_part',
    );
    await queryRunner.query(
      'ALTER INDEX ix_stock_levels_dealer_location RENAME TO ix_part_inventories_dealer_location',
    );
    await queryRunner.query('ALTER TABLE part_inventories ADD COLUMN bin_id uuid NOT NULL REFERENCES bins (id)');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE part_inventories DROP COLUMN bin_id');
    await queryRunner.query(
      'ALTER INDEX ix_part_inventories_dealer_location RENAME TO ix_stock_levels_dealer_location',
    );
    await queryRunner.query(
      'ALTER TABLE part_inventories RENAME CONSTRAINT uq_part_inventories_location_part TO uq_stock_levels_location_part',
    );
    await queryRunner.query(
      'ALTER TABLE part_inventories RENAME CONSTRAINT part_inventories_part_id_fkey TO stock_levels_part_id_fkey',
    );
    await queryRunner.query(
      'ALTER TABLE part_inventories RENAME CONSTRAINT part_inventories_pkey TO stock_levels_pkey',
    );
    await queryRunner.query('ALTER TABLE part_inventories RENAME TO stock_levels');
    await queryRunner.query('DROP TABLE bins');
  }
}
