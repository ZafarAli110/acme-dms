import type {MigrationInterface, QueryRunner} from 'typeorm';

export class InitialSchema1761700000000 implements MigrationInterface {
  public readonly name = 'InitialSchema1761700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE parts (
        id uuid PRIMARY KEY,
        dealer_id uuid NOT NULL,
        part_number varchar(50) NOT NULL,
        description varchar(500) NOT NULL,
        unit_price numeric(12, 2) NOT NULL,
        created_at timestamptz NOT NULL,
        created_by uuid NOT NULL,
        updated_at timestamptz NOT NULL,
        updated_by uuid NOT NULL,
        CONSTRAINT uq_parts_dealer_part_number UNIQUE (dealer_id, part_number)
      )`);
    await queryRunner.query(`
      CREATE TABLE stock_levels (
        id uuid PRIMARY KEY,
        dealer_id uuid NOT NULL,
        location_id uuid NOT NULL,
        part_id uuid NOT NULL REFERENCES parts (id),
        quantity_on_hand integer NOT NULL,
        reorder_level integer NOT NULL,
        updated_at timestamptz NOT NULL,
        updated_by uuid NOT NULL,
        CONSTRAINT uq_stock_levels_location_part UNIQUE (location_id, part_id)
      )`);
    await queryRunner.query(`
      CREATE TABLE part_photos (
        id uuid PRIMARY KEY,
        dealer_id uuid NOT NULL,
        part_id uuid NOT NULL REFERENCES parts (id),
        document_id uuid NOT NULL UNIQUE,
        original_file_name varchar(255) NOT NULL,
        status varchar(20) NOT NULL,
        failure_reason varchar(1000),
        is_default boolean NOT NULL,
        created_at timestamptz NOT NULL,
        created_by uuid NOT NULL
      )`);
    await queryRunner.query(`
      CREATE TABLE processed_messages (
        message_id uuid PRIMARY KEY,
        processed_at timestamptz NOT NULL
      )`);
    await queryRunner.query('CREATE INDEX ix_part_photos_part ON part_photos (dealer_id, part_id)');
    await queryRunner.query('CREATE INDEX ix_stock_levels_dealer_location ON stock_levels (dealer_id, location_id)');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE processed_messages');
    await queryRunner.query('DROP TABLE part_photos');
    await queryRunner.query('DROP TABLE stock_levels');
    await queryRunner.query('DROP TABLE parts');
  }
}
