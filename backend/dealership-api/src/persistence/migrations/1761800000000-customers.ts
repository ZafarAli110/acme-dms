import type {MigrationInterface, QueryRunner} from 'typeorm';

export class Customers1761800000000 implements MigrationInterface {
  public readonly name = 'Customers1761800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE customers (
        id uuid PRIMARY KEY,
        dealer_id uuid NOT NULL,
        location_id uuid NOT NULL,
        first_name varchar(100) NOT NULL,
        surname varchar(100) NOT NULL,
        company_name varchar(200),
        email varchar(254),
        phone varchar(40),
        city varchar(100),
        status varchar(20) NOT NULL,
        last_contact_date date,
        created_at timestamptz NOT NULL,
        created_by uuid NOT NULL,
        updated_at timestamptz NOT NULL,
        updated_by uuid NOT NULL
      )`);
    await queryRunner.query('CREATE INDEX ix_customers_dealer_location ON customers (dealer_id, location_id)');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE customers');
  }
}
