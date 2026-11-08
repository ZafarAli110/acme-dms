-- Trigrams for the customer search (ACME-110): `ilike '%smith%'` can use a GIN index with gin_trgm_ops, never an
-- ordinary one. pg_trgm ships with Postgres and is allowed on the managed services (Azure, RDS, Cloud SQL).
CREATE EXTENSION IF NOT EXISTS pg_trgm;
