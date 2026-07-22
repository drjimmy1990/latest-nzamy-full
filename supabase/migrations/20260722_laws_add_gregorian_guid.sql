-- ─────────────────────────────────────────────────────────────────────────────
-- 20260722_laws_add_gregorian_guid.sql
-- Reconcile library.laws with the seeder (scripts/seed-library.ts seedLaws()).
--
-- The seeder writes two columns that were absent from the checked-in schema
-- (20260626_legal_library_schema.sql): `issue_date_gregorian` and `law_guid`.
-- Against a schema without them, every laws UPSERT batch fails with a PostgREST
-- "could not find column" (400) and NO laws seed at all.
--
-- This migration is IDEMPOTENT: `add column if not exists` is a no-op if the live
-- table already carries these columns (schema drift), and adds them otherwise.
-- Column types/lengths match the seeder's substring() limits (20 / 100).
-- Safe to run any number of times. Apply via Supabase SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

alter table library.laws
  add column if not exists issue_date_gregorian varchar(20);

alter table library.laws
  add column if not exists law_guid varchar(100);
