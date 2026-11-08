-- Each location's names for "Did you mean" (ACME-120). A technical table kept in step with `customers` by
-- statement-level triggers (transition tables: one aggregate per statement, so seed:bulk's 1.6 million rows update it
-- once). docs/standards/database.md, "Migrations on big tables": the triggers are created before the backfill, in this
-- transaction, so saves of customers wait while the backfill runs (seconds at 2.25 million rows); in production, run
-- it in a quiet hour.
SET LOCAL lock_timeout = '5s';--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS fuzzystrmatch;--> statement-breakpoint
CREATE TABLE "customer_names" (
	"dealer_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"kind" varchar(20) NOT NULL,
	"name" varchar(200) NOT NULL,
	"customers" integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_customer_names_location_kind_name" ON "customer_names" ("location_id","kind",lower("name"));--> statement-breakpoint
CREATE INDEX "ix_customer_names_trigrams" ON "customer_names" USING gin (lower("name") gin_trgm_ops);--> statement-breakpoint
-- Location-scoped, as customers: a request sees only its own location's names.
ALTER TABLE "customer_names" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "customer_names_dealer_location" ON "customer_names" FOR ALL TO dealership_api_user
  USING ("dealer_id" = NULLIF(current_setting('app.dealer_id', true), '')::uuid
    AND "location_id" = NULLIF(current_setting('app.location_id', true), '')::uuid)
  WITH CHECK ("dealer_id" = NULLIF(current_setting('app.dealer_id', true), '')::uuid
    AND "location_id" = NULLIF(current_setting('app.location_id', true), '')::uuid);--> statement-breakpoint
-- The names a customer gives the list: the first name, the surname, and each word of the company of three letters or
-- more (so "haulge" can find "Penwood Haulage"). Never the email or the phone: those stay exact.
CREATE FUNCTION customer_names_of(first_name text, surname text, company_name text)
RETURNS TABLE (kind text, name text) LANGUAGE sql IMMUTABLE AS $$
  SELECT 'first', btrim(first_name) WHERE btrim(first_name) <> ''
  UNION ALL
  SELECT 'surname', btrim(surname) WHERE btrim(surname) <> ''
  UNION ALL
  SELECT 'company_word', word FROM regexp_split_to_table(coalesce(company_name, ''), '[^[:alpha:]]+') AS word
  WHERE length(word) >= 3
$$;--> statement-breakpoint
-- Adds the inserted (and the new side of updated) live customers' names, takes away the deleted (and the old side of
-- updated) ones, and forgets a name nobody has any more. SECURITY DEFINER: it writes the list as its owner, whatever
-- role saved the customer (a request's rows are its own location's, so nothing else is touched).
CREATE FUNCTION customer_names_follow() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  changed text;
BEGIN
  changed := CASE TG_OP
    WHEN 'INSERT' THEN
      'SELECT dealer_id, location_id, first_name, surname, company_name, 1 AS sign FROM new_customers WHERE NOT is_deleted'
    WHEN 'DELETE' THEN
      'SELECT dealer_id, location_id, first_name, surname, company_name, -1 AS sign FROM old_customers WHERE NOT is_deleted'
    ELSE
      'SELECT dealer_id, location_id, first_name, surname, company_name, 1 AS sign FROM new_customers WHERE NOT is_deleted '
      || 'UNION ALL SELECT dealer_id, location_id, first_name, surname, company_name, -1 FROM old_customers WHERE NOT is_deleted'
  END;
  EXECUTE format($sql$
    INSERT INTO customer_names AS names (dealer_id, location_id, kind, name, customers)
    SELECT changed.dealer_id, changed.location_id, named.kind, min(named.name), sum(changed.sign)::int
    FROM (%s) AS changed
    CROSS JOIN LATERAL customer_names_of(changed.first_name, changed.surname, changed.company_name) AS named
    GROUP BY changed.dealer_id, changed.location_id, named.kind, lower(named.name)
    HAVING sum(changed.sign) <> 0
    ON CONFLICT (location_id, kind, lower(name)) DO UPDATE SET customers = names.customers + EXCLUDED.customers
  $sql$, changed);
  DELETE FROM customer_names WHERE customers <= 0;
  RETURN NULL;
END
$$;--> statement-breakpoint
CREATE TRIGGER customer_names_after_insert AFTER INSERT ON customers
  REFERENCING NEW TABLE AS new_customers FOR EACH STATEMENT EXECUTE FUNCTION customer_names_follow();--> statement-breakpoint
CREATE TRIGGER customer_names_after_update AFTER UPDATE ON customers
  REFERENCING OLD TABLE AS old_customers NEW TABLE AS new_customers FOR EACH STATEMENT EXECUTE FUNCTION customer_names_follow();--> statement-breakpoint
CREATE TRIGGER customer_names_after_delete AFTER DELETE ON customers
  REFERENCING OLD TABLE AS old_customers FOR EACH STATEMENT EXECUTE FUNCTION customer_names_follow();--> statement-breakpoint
-- The live customers there are now.
INSERT INTO customer_names (dealer_id, location_id, kind, name, customers)
SELECT customers.dealer_id, customers.location_id, named.kind, min(named.name), count(*)::int
FROM customers
CROSS JOIN LATERAL customer_names_of(customers.first_name, customers.surname, customers.company_name) AS named
WHERE NOT customers.is_deleted
GROUP BY customers.dealer_id, customers.location_id, named.kind, lower(named.name);
